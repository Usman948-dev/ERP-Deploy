-- ============================================================================
-- 002_seed_admin_user.sql
--
-- Creates one initial Admin login. Without this, a freshly created database
-- has an empty Users table and nobody can log in at all.
--
-- IMPORTANT: this inserts a PLAINTEXT password on purpose, not a mistake —
-- AuthController.Login (see Security/PasswordHasher.cs) already detects a
-- plaintext row on login, verifies it, and silently upgrades it to a real
-- PBKDF2 hash right there in the login flow. There's no way to produce a
-- valid PBKDF2 hash from plain SQL anyway (it needs a random salt generated
-- in code), so this "insert plaintext, let the app hash it on first login"
-- approach reuses the exact mechanism already built for migrating existing
-- users — it isn't a special case.
--
-- CHANGE THE PASSWORD AND EMAIL BELOW before running this, and log in with
-- the password immediately after setup to trigger the upgrade to a hash.
-- The email is what "forgot password" sends a reset link to — see
-- AuthController.ForgotPassword — so it needs to be a real, checkable inbox.
-- ============================================================================

USE iMarkDB;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = 'admin')
BEGIN
    INSERT INTO dbo.Users (Username, Password, FullName, UserRole, Email)
    VALUES ('admin', 'CHANGE_ME_BEFORE_RUNNING_THIS_SCRIPT', 'Administrator', 'Admin', 'CHANGE_ME@example.com');
END
GO
