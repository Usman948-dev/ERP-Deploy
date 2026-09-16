# Tests

## What's covered

Unit tests for the two pure, self-contained security modules added this
round — `Security/PasswordHasher.cs` and `Security/TokenService.cs`. Both
are deterministic, have no database dependency, and are security-critical
code that was originally written without the ability to compile-check it
(no `dotnet`/NuGet access in the sandbox it was built in) — these tests are
partly there to catch exactly that risk.

Covered: correct password round-trips, wrong passwords rejected, salting
actually varies per-hash, tampered/forged tokens rejected, tokens signed
with a different key rejected (confirms rotating `AUTH_SIGNING_KEY`
actually invalidates old sessions), expired tokens rejected, and garbage/
malformed input fails safe (returns null/false) instead of throwing.

## What's NOT covered, and why

**Controllers** (`SalesController`, `ProductsController`, etc.) have no
tests. These use raw ADO.NET (`SqlConnection`/`SqlCommand`/`SqlDataReader`)
directly with no repository/abstraction layer in front of the database, so
testing them means either:

- **Integration tests against a real SQL Server** — the most honest option,
  but there's no test database available in the environment this was built
  in, so nothing here could have been verified even if written.
- **Mocking ADO.NET directly** — technically possible but notoriously
  awkward (these classes aren't designed for it) and the resulting tests
  tend to verify the mock setup more than real behavior.

If you want controller-level coverage, the more valuable next step is
usually introducing a thin repository/data-access interface the
controllers depend on (so it can be faked in tests), or standing up a
docker-compose based integration test project against a real (throwaway)
SQL Server instance — either is a bigger, separate piece of work from what
could be done here.

## Running

```bash
cd backend
dotnet test
```

Like the rest of the backend, this needs internet/NuGet access to restore
`xunit`, `xunit.runner.visualstudio`, `Microsoft.NET.Test.Sdk`, and
`Microsoft.Extensions.Configuration` — none of which could be verified to
restore or compile in the sandbox these tests were written in. Same
caveat as `dotnet build` elsewhere in this project: run it yourself before
relying on it.
