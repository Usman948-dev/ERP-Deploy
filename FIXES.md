# Fix Summary — ERP-Deploy

This document lists everything that was changed, why, and what you still need
to do manually before deploying. Read the "Manual steps required" section
before anything else — code changes alone can't fix a compromised password.

## ⚠️ Manual steps required (do these first)

1. **Rotate the SQL Server `sa` password.** The old one (`Usman5138@`) was
   hardcoded in source and is very likely exposed in your GitHub history
   (the repo at `github.com/Usman948-dev/ERP-Deploy` returns a public 200
   from GitHub's API, meaning it's not private). Changing the password
   going forward doesn't erase it from history — if you want it gone from
   history too, look into `git filter-repo` or the BFG Repo-Cleaner, or
   simply treat the repo's history as burned and start a fresh one.

   **This zip already includes a real `.env`** at the project root with a
   freshly generated password and signing key (never the old compromised
   one) — it's `.gitignore`'d, so it won't get committed even if you
   `git add -A` the whole folder. The one thing you still need to do
   yourself: actually change your SQL Server's `sa` password to match what's
   in that `.env` (`ALTER LOGIN sa WITH PASSWORD = '...'` against your real
   server), since a file with the right value in it doesn't change your
   actual database password for you. If you're instead using the bundled
   `sql-server` container from `docker-compose.yml` and starting it fresh,
   no manual step is needed — it'll be created with that password.
2. **If you ever want to regenerate the `.env` values** (e.g. you already
   rotated the password to something else, or want a different one),
   `.env.example` at the project root documents every variable.
3. **Run `dotnet build` and `dotnet test` locally.** I don't have internet/NuGet
   access in my sandbox, so all the C# (including the new test project) is
   hand-reviewed but not compiler-verified. The frontend changes ARE
   verified (`npm run build` and `npx eslint .` both pass clean, checked
   repeatedly after every batch of changes).
4. **Test login end-to-end** against a real database before deploying:
   log in with an existing user, confirm you get a token back, confirm
   protected pages still load, confirm a request with no token gets a 401.
5. **`docker compose up`** now brings up a 4th container (`caddy`) that
   didn't exist before — this is the new single entry point (see "TLS"
   below). Only Caddy publishes ports 80/443 to the host now; the API and
   frontend containers no longer publish ports directly.
6. **Set a real email on your admin account** if you want "forgot password"
   to work for it — either update `backend/database/002_seed_admin_user.sql`
   before running it on a fresh database, or `UPDATE dbo.Users SET Email = '...'
   WHERE Username = 'admin'` directly if the account already exists.

## TLS / Reverse proxy (Caddy)

Everything previously traveled over plain HTTP — including the login
password and the new auth token, both in cleartext. Added `Caddyfile` +
a 4th `caddy` service in `docker-compose.yml` as the sole public entry
point in front of both the frontend and the API.

- **Right now**: self-signed certificate (`tls internal` in the
  Caddyfile) — works immediately with the bare IP address, but browsers
  will show a "not secure" warning until the certificate is trusted.
  This is unavoidable with a bare IP: Let's Encrypt cannot issue
  certificates for IP addresses at all, only real domain names — that's
  a CA policy limit, not a config limitation.
- **Once you have a domain**: point it at this server, set `SITE_ADDRESS`
  in `.env` to that domain, delete the `tls internal` line in the
  `Caddyfile`, and Caddy automatically gets a free, trusted,
  auto-renewing certificate with no further setup.
- The frontend now calls a **relative** `/api` path instead of an
  absolute URL (`src/config.js`) — Caddy routes `/api/*` to the backend
  and everything else to the frontend on the same origin. This also
  means normal traffic is same-origin and doesn't hit CORS at all;
  `Cors:AllowedOrigins` is kept as defense-in-depth for anything that
  calls the API directly, cross-origin.
- Local dev (`npm run dev`) still works — added a Vite dev-server proxy
  (`vite.config.js`) that forwards `/api/*` to your local `dotnet run`
  process instead.

## Server error handling & logging

Found 26 places across every controller doing
`catch (Exception ex) { return StatusCode(500, ex.Message); }` — the raw
exception message (which for a SQL error can include table/column names)
went straight to whoever called the API, and there was **zero logging
anywhere** in the backend, so a failure at 2am would leave no trace.

- Every controller now injects `ILogger<T>` and logs the real exception
  server-side before returning a response.
- Added `Common/BusinessRuleException.cs` — a small dedicated exception
  type for *deliberate*, safe-to-display validation failures (e.g.
  "Only 3 units in stock", "Cannot redeem more points than available").
  Controllers catch this type separately so those specific messages still
  reach the user unchanged, while anything genuinely unexpected (a raw
  `SqlException`, a null reference, etc.) is logged in full but hidden
  behind a generic "Something went wrong" message to the client. Applied
  everywhere this pattern existed: `SalesController` (Checkout,
  ProcessReturn), `ProductionController` (RecordProduction),
  `TransfersController` (ApproveTransfer).
- Added a global exception handler (`Program.cs`, `IExceptionHandler`) as
  defense-in-depth — catches anything that somehow escapes an individual
  controller's own try/catch (e.g. future code that forgets to wrap a new
  endpoint), so the failure mode is always "logged + generic 500," never
  a leaked stack trace.
- Fixed two spots where a deliberately-thrown validation error was
  previously returned as a raw 500 instead of a 400 (`ProcessReturn`'s
  "item not found in this sale" / "cannot return more than purchased" —
  these are client validation errors, not server failures).

## Dashboard KPIs added

`SalesController.GetSummary` now returns 4 additional metrics (all computed
in SQL, no schema changes needed) and a new result set for top products:

- **Average Order Value (AOV)** — `(GrossSales - Refunds) / OrderCount`.
- **Return Rate** — `Refunds / GrossSales × 100`. Dashboard card turns red
  above 10%.
- **Stock-Out Count** — live count of products at `StockQty <= 0`. Not
  date-filtered (always reflects current stock).
- **Accounts Payable Balance** — `SUM(TotalCost - AmountPaid)` across all
  purchases not yet fully paid.
- **Top 5 Products by Revenue** — new horizontal bar chart on the dashboard,
  grouped by barcode for the selected date range.

`Dashboard.jsx` has a new second row of stat cards for these four, plus a
new "Top 5 Products by Revenue" chart section. Verified: build and lint
both still pass clean after these additions.

## DB migration scripts

Added `backend/database/001_initial_schema.sql` and
`002_seed_admin_user.sql` — most tables previously had no creation script
in source control at all (only `ProductionBatches`, `ProductionMaterials`,
`StockTransfers`, `Customers`, and `ReturnLogs` self-created the first
time their controller ran; `Users`, `Products`, `Suppliers`, `Purchases`,
`PurchaseItems`, `AccountsPayable`, `Expenses`, `Sales`, and `SaleItems`
had no creation script anywhere). Every column in the new script was
reverse-engineered directly from the actual SQL statements in the
controllers — not guessed. See `backend/database/README.md` for usage;
run both scripts against a fresh database before starting the API for the
first time.

## Concurrent-checkout stock locking

`SalesController.Checkout` and `TransfersController.ApproveTransfer` both
had the same bug: they `SELECT` current stock, check it in C#, then
`UPDATE` it in a later statement — under SQL Server's default isolation,
two simultaneous requests on the same low-stock item could both read the
same quantity before either commits, both pass the check, and both
succeed, taking stock negative. `TransfersController.ApproveTransfer` had
a second version of the same bug on the transfer's own status check — two
concurrent approve clicks on the *same* transfer could both read
`Status='Pending'` and both move stock, double-processing one transfer.

Fixed with a standard `WITH (UPDLOCK, HOLDLOCK)` table hint on both reads,
which forces a second concurrent request touching the same row to wait
until the first transaction commits or rolls back. `ProductionController`
was checked too — its stock deduction is a single atomic
`UPDATE ... SET StockQty = StockQty - @qty` statement, not a read-then-write
across two statements, so it isn't vulnerable to this and needed no change.

## Tests

Added `backend/BucketSolutionsAPI.Tests/` — see its own `README.md` for
exactly what is and isn't covered, and why. Short version: real unit tests
for the two pure, DB-free security modules added this round
(`PasswordHasher`, `TokenService`); no controller tests, since those touch
a live database this environment doesn't have and there's no
mocking-friendly data-access layer to fake instead — that would be a
separate, bigger piece of work.

## Not yet done

Nothing left from the original suggestions list. If anything else comes up
after you've tested this batch, happy to take another pass.

## Low-stock alerts

Added a `ReorderPoint` field per product (auto-migrating column on
`Products`, defaults to 0 = alerts off for that item). Set it in the
Inventory page's add/edit form (new "Reorder At" field). A new
`GET /api/products/low-stock` endpoint returns everything at or below its
threshold; the Dashboard shows a red warning banner listing them whenever
there's at least one. The Inventory table's stock indicator now reflects
the real per-item threshold instead of a hardcoded ">10 = green" rule.

## Password reset (forgot password + self-service change)

Two separate flows, both needed:

- **Forgot password** (can't log in at all): `POST /api/auth/forgot-password`
  → emails a time-limited (30 min) reset link → `POST /api/auth/reset-password`
  consumes it. Always returns the same generic response regardless of
  whether the email matches an account, to prevent account enumeration.
  The reset link uses a **completely separate token type** from login
  session tokens (`TokenService.CreatePasswordResetToken`, signed with a
  key derived from — but different from — the main signing key), so a
  leaked reset-email link can never be replayed as a full login session.
- **Change password** (already logged in): new "⚙️ Account Settings" page
  (`ChangePassword.jsx`), calls `POST /api/auth/change-password`. Identity
  comes from the caller's own auth token, never from the request body, so
  a user can only ever change their own password.
- Email sending (`Security/EmailService.cs`) uses built-in
  `System.Net.Mail.SmtpClient` — no new NuGet package needed. Works with
  Gmail app passwords, SendGrid, Mailgun, SES, Postmark, or any plain-SMTP
  provider. **Optional**: if `Smtp:Host`/`Smtp__Host` isn't configured, the
  app still runs fine — forgot-password requests are accepted normally,
  just logged as "email skipped" instead of actually sending. See
  `.env.example` for the `SMTP_*` variables.
- `Users` gained an `Email` column (auto-migrating, same pattern as
  `ReorderPoint` above). The seed admin script now needs a real email set
  too — see `backend/database/002_seed_admin_user.sql`.

## Customer purchase history report

New: click any customer's phone number in Reports → Loyalty Points to open
a modal showing everything they've ever bought — product name, net
quantity (purchased minus returned), amount spent, and last purchase date.
Backend: `GET /api/sales/customer/{phone}/purchases`, aggregated from
`SaleItems`/`Sales` grouped by product. No schema changes needed — this
reads data that was already being recorded.

## Backend (C#/.NET)

**Security**
- Removed the hardcoded `sa` password from 8 controller files — connection
  string now comes from `IConfiguration` (`appsettings.json` /
  `ConnectionStrings__DefaultConnection` env var).
- Added real authentication (`Security/TokenService.cs`,
  `SimpleTokenAuthHandler.cs`) — a signed, expiring bearer token, using only
  built-in .NET crypto (no new NuGet packages). Every endpoint now requires
  a valid token by default (`Program.cs`); only `POST /api/auth/login` is
  public (`[AllowAnonymous]`).
- Passwords are now hashed (PBKDF2, `Security/PasswordHasher.cs`) instead of
  stored/compared in plaintext. Existing plaintext rows are transparently
  upgraded to a hash the next time that user logs in successfully — no
  manual data migration needed.
- CORS changed from `AllowAnyOrigin()` to a configured allow-list
  (`Cors:AllowedOrigins`).
- `ExpensesController.AddExpense` no longer trusts a client-supplied `Role`
  field to decide auto-approval (previously any caller could send
  `"Role": "Admin"` and get instant approval) — role now comes from the
  verified token.
- `ExpensesController.UpdateStatus` and `SalesController.DeleteSale` are
  now restricted to the `Admin` role.

**Bugs**
- Removed `ProductsController`'s duplicate `/transfer*` endpoints — they
  queried columns (`Barcode`, `RequestedQty`, `ApprovedBy`, `ApprovalDate`)
  that don't exist in the `StockTransfers` table `TransfersController`
  actually creates. Confirmed via the frontend that only `/api/transfers/*`
  is ever called; the `/api/products/transfer*` routes were dead code.
- `SalesController.GetSummary`'s expense-breakdown chart no longer returns
  hardcoded constants (`Operating=100, Electricity=150, Wastage=50`
  regardless of date range) — now pulled from real `Expenses` and
  `ProductionBatches` data.
- Loyalty points: a negative `PointsRedeemed` used to *add* points instead
  of redeeming them, and there was no check that the customer actually had
  enough points to redeem. Both are now validated against the real balance
  inside the checkout transaction.
- Added missing null-guards on `PurchasesController.AddPurchase`,
  `SalesController.ProcessReturn`, and `SuppliersController.Add` (a
  malformed/empty request body used to 500 with a raw
  `NullReferenceException` instead of a clean 400).

**Cleanup**
- Moved `SuppliersController.cs` into `Controllers/` (was in the project root).
- Fixed the `Dockerfile`'s port mismatch (`EXPOSE 80` vs. the actual 8080).
- `docker-compose.yml` now reads secrets from environment variables instead
  of hardcoding them.
- Added a `.gitignore` — there wasn't one, which is part of how the
  password ended up committed in the first place.
- Removed the 3 stray empty `New Text Document.txt` files.
- Added nullable annotations across DTOs to clear `CS8618` build warnings.

## Frontend (React/Vite)

Verified clean: `npm run build` succeeds, `npx eslint .` reports 0 errors/warnings.

- **Fixed a crash bug**: `production.jsx` had an early `return` before
  several `useState`/`useEffect` calls, violating React's Rules of Hooks —
  this would throw whenever the `user` prop changed.
- Deleted `Products.jsx` — confirmed orphaned dead code, never imported
  anywhere, pointed at a nonexistent `localhost:5000` API.
- Centralized the API URL (`src/config.js`, `VITE_API_URL` env var) instead
  of it being hardcoded separately in 13 different files.
- Added `src/lib/authFetch.js` — wraps the global `fetch()` once so every
  existing `fetch()` call across the app automatically attaches the auth
  token and redirects to login on a 401, without needing to hand-edit every
  call site.
- Login now stores the token (`localStorage`) and the logged-in user
  persists across a page refresh (previously refreshing always logged you out).
- Fixed the `setState`-in-effect anti-pattern in `POS.jsx`'s return/refund
  calculation (now a derived `useMemo` instead of state set from an effect).
- Fixed ~20 ESLint errors: function-declared-after-use ordering, unused
  variables/imports, a dead variable initialization, and unused catch bindings.

## What I could NOT verify

I don't have `dotnet` or NuGet access in this sandbox, so the C# changes
are carefully hand-written and reviewed (brace-balance checked, read
through in full) but not compiler-verified. Please run `dotnet build`
before deploying — see "Manual steps required" above.
