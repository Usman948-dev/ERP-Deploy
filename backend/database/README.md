# Database scripts

Previously there were none of these anywhere in the repo — most tables only
ever existed because the API happened to create them on first run (and
several, like `Users`, `Suppliers`, `Purchases`, didn't even have that).
If the database were ever lost, there was no way to rebuild it from what
was in source control.

## Usage

Run these in order against a fresh SQL Server instance, **before** starting
the API for the first time:

```bash
sqlcmd -S <server> -U sa -P <password> -i 001_initial_schema.sql
sqlcmd -S <server> -U sa -P <password> -i 002_seed_admin_user.sql
```

Both are safe to re-run (every statement is guarded with `IF NOT EXISTS`) —
running them again against a database that already has this schema does
nothing.

## After running

1. Edit `002_seed_admin_user.sql` to set a real password before running it
   (or run it as-is and change the password immediately after your first
   login — see the comment in that file for why the plaintext insert there
   is intentional, not a mistake).
2. Log in as `admin` right away — this triggers the automatic upgrade from
   the plaintext seed password to a real hash (see
   `backend/BucketSolutionsAPI/Security/PasswordHasher.cs`).
3. Everything from here on is normal applicaton use — the API's own
   controllers still handle day-to-day schema additions the same way they
   always have (e.g. adding a new column via `IF COL_LENGTH(...) IS NULL`).
   These scripts are for bootstrapping a new environment, not a replacement
   for that.

## Where this schema came from

Reverse-engineered directly from every SQL statement in the C# controllers —
not guessed. Every column name here is one the application code actually
reads or writes somewhere.
