using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Security.Claims;
using BucketSolutionsAPI.Security;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly string connString;
        private readonly IConfiguration _config;
        private readonly ILogger<AuthController> _logger;
        private readonly IEmailService _emailService;

        public AuthController(IConfiguration config, ILogger<AuthController> logger, IEmailService emailService)
        {
            _config = config;
            _logger = logger;
            _emailService = emailService;
            connString = _config.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured.");

            // --- AUTO MIGRATION: adds the Email column needed for password
            // reset onto an existing live Users table.
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string migrate = @"
                        IF COL_LENGTH('dbo.Users', 'Email') IS NULL
                            ALTER TABLE dbo.Users ADD Email NVARCHAR(200) NULL;
                    ";
                    using (SqlCommand cmd = new SqlCommand(migrate, conn)) { cmd.ExecuteNonQuery(); }
                }
            }
            catch { /* Fails silently if already migrated or DB briefly unavailable at startup */ }
        }

        // We use ? here to tell C# these might be empty, fixing the yellow CS8618 warnings!
        public class LoginReq
        {
            public string? Username { get; set; }
            public string? Password { get; set; }
        }

        // Publicly reachable — this is the one endpoint that must work without
        // an existing token, since it's what issues the token in the first place.
        // Every other endpoint in the API requires auth by default (see Program.cs).
        [AllowAnonymous]
        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginReq req)
        {
            if (req == null || string.IsNullOrEmpty(req.Username) || string.IsNullOrEmpty(req.Password))
                return BadRequest("Missing credentials");

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();

                    // Only look the user up by username — the password check happens
                    // below, in code, so we can support hashed passwords (and
                    // transparently migrate legacy plaintext ones on successful login).
                    string sql = "SELECT FullName, UserRole, Password FROM Users WHERE TRIM(Username) = @u";

                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@u", req.Username.Trim());

                        string? fullName = null;
                        string? role = null;
                        string? storedPassword = null;

                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            if (r.Read())
                            {
                                fullName = r["FullName"].ToString();
                                role = r["UserRole"].ToString();
                                storedPassword = r["Password"].ToString();
                            }
                        }

                        if (fullName == null || storedPassword == null)
                            return Unauthorized("Invalid credentials");

                        bool passwordOk;
                        if (PasswordHasher.IsHashed(storedPassword))
                        {
                            passwordOk = PasswordHasher.Verify(req.Password.Trim(), storedPassword);
                        }
                        else
                        {
                            // Legacy plaintext row (pre-existing data). Compare directly,
                            // then silently upgrade it to a proper hash so it's never
                            // stored in plaintext again after this point.
                            passwordOk = storedPassword.Trim() == req.Password.Trim();
                            if (passwordOk)
                            {
                                string newHash = PasswordHasher.Hash(req.Password.Trim());
                                using (SqlCommand upgradeCmd = new SqlCommand(
                                    "UPDATE Users SET Password = @p WHERE TRIM(Username) = @u", conn))
                                {
                                    upgradeCmd.Parameters.AddWithValue("@p", newHash);
                                    upgradeCmd.Parameters.AddWithValue("@u", req.Username.Trim());
                                    upgradeCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        if (!passwordOk)
                            return Unauthorized("Invalid credentials");

                        string token = TokenService.CreateToken(_config, req.Username.Trim(), role ?? "", TimeSpan.FromHours(12));

                        return Ok(new
                        {
                            name = fullName,
                            role = role,
                            token = token
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Login failed unexpectedly for username {Username}", req.Username);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        public class ForgotPasswordReq
        {
            public string? Email { get; set; }
        }

        // Publicly reachable — this is how a user starts a reset when they
        // can't log in at all (no token to prove who they are yet).
        //
        // SECURITY NOTE: this always returns the same generic success message,
        // whether or not the email actually matches an account. Returning a
        // different response for "email exists" vs "email not found" would let
        // an attacker enumerate which email addresses have accounts on this
        // system just by trying them here — a well-known anti-pattern.
        [AllowAnonymous]
        [HttpPost("forgot-password")]
        public IActionResult ForgotPassword([FromBody] ForgotPasswordReq req)
        {
            const string genericResponse = "If that email is registered, a password reset link has been sent.";

            if (req == null || string.IsNullOrWhiteSpace(req.Email))
                return Ok(new { message = genericResponse });

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string? username = null;

                    using (SqlCommand cmd = new SqlCommand(
                        "SELECT Username FROM dbo.Users WHERE TRIM(Email) = @e", conn))
                    {
                        cmd.Parameters.AddWithValue("@e", req.Email.Trim());
                        object result = cmd.ExecuteScalar();
                        if (result != null && result != DBNull.Value) username = result.ToString();
                    }

                    if (username != null)
                    {
                        string resetToken = TokenService.CreatePasswordResetToken(_config, username, TimeSpan.FromMinutes(30));

                        string frontendUrl = _config["Frontend:BaseUrl"] ?? "";
                        string resetLink = string.IsNullOrEmpty(frontendUrl)
                            ? $"?resetToken={Uri.EscapeDataString(resetToken)}"
                            : $"{frontendUrl.TrimEnd('/')}/?resetToken={Uri.EscapeDataString(resetToken)}";

                        string bodyHtml = $@"
                            <p>Someone requested a password reset for this account.</p>
                            <p><a href=""{resetLink}"">Click here to reset your password</a> (link expires in 30 minutes).</p>
                            <p>If you didn't request this, you can safely ignore this email — your password won't change unless you click the link above and set a new one.</p>";

                        // Fire-and-forget is intentional here: SendAsync already never
                        // throws (see EmailService.cs), and this endpoint's response
                        // must not reveal timing differences between "email sent" and
                        // "email not configured/failed" — both look identical to the caller.
                        _ = _emailService.SendAsync(req.Email.Trim(), "Password Reset Request", bodyHtml);
                    }
                }
            }
            catch (Exception ex)
            {
                // Still logged for the admin's benefit, but the response to the
                // caller stays generic either way — see the SECURITY NOTE above.
                _logger.LogError(ex, "Unexpected error in ForgotPassword flow");
            }

            return Ok(new { message = genericResponse });
        }

        public class ResetPasswordReq
        {
            public string? Token { get; set; }
            public string? NewPassword { get; set; }
        }

        [AllowAnonymous]
        [HttpPost("reset-password")]
        public IActionResult ResetPassword([FromBody] ResetPasswordReq req)
        {
            if (req == null || string.IsNullOrEmpty(req.Token) || string.IsNullOrEmpty(req.NewPassword))
                return BadRequest("Missing token or new password.");

            if (req.NewPassword.Length < 8)
                return BadRequest("Password must be at least 8 characters.");

            var payload = TokenService.ValidatePasswordResetToken(_config, req.Token);
            if (payload == null)
                return BadRequest("This reset link is invalid or has expired. Please request a new one.");

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string newHash = PasswordHasher.Hash(req.NewPassword);
                    using (SqlCommand cmd = new SqlCommand(
                        "UPDATE dbo.Users SET Password = @p WHERE TRIM(Username) = @u", conn))
                    {
                        cmd.Parameters.AddWithValue("@p", newHash);
                        cmd.Parameters.AddWithValue("@u", payload.Username);
                        int rows = cmd.ExecuteNonQuery();
                        if (rows == 0) return BadRequest("This reset link is invalid or has expired. Please request a new one.");
                    }
                }
                return Ok(new { message = "Password updated. You can now log in with your new password." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to reset password for username {Username}", payload.Username);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        public class ChangePasswordReq
        {
            public string? CurrentPassword { get; set; }
            public string? NewPassword { get; set; }
        }

        // Requires a valid session token (no [AllowAnonymous]) — this is the
        // "I'm logged in and want to change my password" flow, distinct from
        // ForgotPassword/ResetPassword above (which is for when a user can't
        // log in at all). Identity comes from the token, never from the
        // request body, so a user can only ever change their own password.
        [HttpPost("change-password")]
        public IActionResult ChangePassword([FromBody] ChangePasswordReq req)
        {
            string? username = User.FindFirst(ClaimTypes.Name)?.Value;
            if (string.IsNullOrEmpty(username)) return Unauthorized();

            if (req == null || string.IsNullOrEmpty(req.CurrentPassword) || string.IsNullOrEmpty(req.NewPassword))
                return BadRequest("Missing current or new password.");

            if (req.NewPassword.Length < 8)
                return BadRequest("New password must be at least 8 characters.");

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string? storedPassword = null;

                    using (SqlCommand cmd = new SqlCommand(
                        "SELECT Password FROM dbo.Users WHERE TRIM(Username) = @u", conn))
                    {
                        cmd.Parameters.AddWithValue("@u", username);
                        object result = cmd.ExecuteScalar();
                        if (result != null && result != DBNull.Value) storedPassword = result.ToString();
                    }

                    if (storedPassword == null) return Unauthorized();

                    bool currentPasswordOk = PasswordHasher.IsHashed(storedPassword)
                        ? PasswordHasher.Verify(req.CurrentPassword, storedPassword)
                        : storedPassword.Trim() == req.CurrentPassword.Trim(); // legacy plaintext row

                    if (!currentPasswordOk)
                        return BadRequest("Current password is incorrect.");

                    string newHash = PasswordHasher.Hash(req.NewPassword);
                    using (SqlCommand cmd = new SqlCommand(
                        "UPDATE dbo.Users SET Password = @p WHERE TRIM(Username) = @u", conn))
                    {
                        cmd.Parameters.AddWithValue("@p", newHash);
                        cmd.Parameters.AddWithValue("@u", username);
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok(new { message = "Password changed successfully." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to change password for username {Username}", username);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }
    }
}
