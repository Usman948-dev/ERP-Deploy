using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BucketSolutionsAPI.Security
{
    // A minimal, self-contained signed-token implementation (HMAC-SHA256 over a
    // JSON payload, base64url-encoded — conceptually similar to a JWT but hand
    // rolled). This deliberately avoids the System.IdentityModel.Tokens.Jwt /
    // Microsoft.AspNetCore.Authentication.JwtBearer NuGet packages so the
    // project keeps building with zero extra package restores.
    //
    // If you later want industry-standard JWTs (e.g. for interop with another
    // service), swap this out for Microsoft.AspNetCore.Authentication.JwtBearer —
    // SimpleTokenAuthHandler was written to make that swap straightforward.
    public static class TokenService
    {
        public class TokenPayload
        {
            public string Username { get; set; } = "";
            public string Role { get; set; } = "";
            public long ExpiresUtc { get; set; }
        }

        // Separate payload shape for password-reset tokens — deliberately has
        // no Role field, and is signed with a DIFFERENT derived key (see
        // GetPasswordResetSigningKey below) so it can never be accepted as a
        // login session token by SimpleTokenAuthHandler, even if someone
        // tried to feed a leaked reset-email link straight into the API as
        // an Authorization header.
        public class PasswordResetPayload
        {
            public string Username { get; set; } = "";
            public long ExpiresUtc { get; set; }
        }

        private static byte[] GetSigningKey(IConfiguration config)
        {
            var secret = config["Auth:SigningKey"];
            if (string.IsNullOrWhiteSpace(secret))
            {
                throw new InvalidOperationException(
                    "Auth:SigningKey is not configured. Set it via appsettings.json or the " +
                    "Auth__SigningKey environment variable before starting the API.");
            }
            return Encoding.UTF8.GetBytes(secret);
        }

        // Derives a DIFFERENT key from the same base secret, specifically for
        // password-reset tokens (standard technique: HMAC the base key with a
        // fixed, purpose-specific label to get an independent-looking key).
        // This is what makes a reset token cryptographically unusable as a
        // session token, and vice versa, without needing a second secret to
        // configure and keep track of.
        private static byte[] GetPasswordResetSigningKey(IConfiguration config)
        {
            using var hmac = new HMACSHA256(GetSigningKey(config));
            return hmac.ComputeHash(Encoding.UTF8.GetBytes("password-reset-v1"));
        }

        public static string CreateToken(IConfiguration config, string username, string role, TimeSpan lifetime)
        {
            var payload = new TokenPayload
            {
                Username = username,
                Role = role,
                ExpiresUtc = DateTimeOffset.UtcNow.Add(lifetime).ToUnixTimeSeconds()
            };

            string json = JsonSerializer.Serialize(payload);
            string payloadB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(json));

            using var hmac = new HMACSHA256(GetSigningKey(config));
            byte[] sig = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadB64));
            string sigB64 = Base64UrlEncode(sig);

            return $"{payloadB64}.{sigB64}";
        }

        // Returns null if the token is missing, malformed, tampered with, or expired.
        public static TokenPayload? ValidateToken(IConfiguration config, string? token)
        {
            if (string.IsNullOrWhiteSpace(token)) return null;

            var parts = token.Split('.');
            if (parts.Length != 2) return null;

            byte[] expectedSig;
            byte[] actualSig;
            try
            {
                using var hmac = new HMACSHA256(GetSigningKey(config));
                expectedSig = hmac.ComputeHash(Encoding.UTF8.GetBytes(parts[0]));
                actualSig = Base64UrlDecode(parts[1]);
            }
            catch
            {
                return null;
            }

            if (expectedSig.Length != actualSig.Length) return null;
            if (!CryptographicOperations.FixedTimeEquals(expectedSig, actualSig)) return null;

            TokenPayload? payload;
            try
            {
                var json = Encoding.UTF8.GetString(Base64UrlDecode(parts[0]));
                payload = JsonSerializer.Deserialize<TokenPayload>(json);
            }
            catch
            {
                return null;
            }

            if (payload == null) return null;
            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > payload.ExpiresUtc) return null;

            return payload;
        }

        // --- Password reset tokens (see PasswordResetPayload above for why
        // these are a fully separate token type from session tokens) ---

        public static string CreatePasswordResetToken(IConfiguration config, string username, TimeSpan lifetime)
        {
            var payload = new PasswordResetPayload
            {
                Username = username,
                ExpiresUtc = DateTimeOffset.UtcNow.Add(lifetime).ToUnixTimeSeconds()
            };

            string json = JsonSerializer.Serialize(payload);
            string payloadB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(json));

            using var hmac = new HMACSHA256(GetPasswordResetSigningKey(config));
            byte[] sig = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadB64));
            string sigB64 = Base64UrlEncode(sig);

            return $"{payloadB64}.{sigB64}";
        }

        public static PasswordResetPayload? ValidatePasswordResetToken(IConfiguration config, string? token)
        {
            if (string.IsNullOrWhiteSpace(token)) return null;

            var parts = token.Split('.');
            if (parts.Length != 2) return null;

            byte[] expectedSig;
            byte[] actualSig;
            try
            {
                using var hmac = new HMACSHA256(GetPasswordResetSigningKey(config));
                expectedSig = hmac.ComputeHash(Encoding.UTF8.GetBytes(parts[0]));
                actualSig = Base64UrlDecode(parts[1]);
            }
            catch
            {
                return null;
            }

            if (expectedSig.Length != actualSig.Length) return null;
            if (!CryptographicOperations.FixedTimeEquals(expectedSig, actualSig)) return null;

            PasswordResetPayload? payload;
            try
            {
                var json = Encoding.UTF8.GetString(Base64UrlDecode(parts[0]));
                payload = JsonSerializer.Deserialize<PasswordResetPayload>(json);
            }
            catch
            {
                return null;
            }

            if (payload == null) return null;
            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > payload.ExpiresUtc) return null;

            return payload;
        }

        private static string Base64UrlEncode(byte[] bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        private static byte[] Base64UrlDecode(string input)
        {
            string s = input.Replace('-', '+').Replace('_', '/');
            switch (s.Length % 4)
            {
                case 2: s += "=="; break;
                case 3: s += "="; break;
                case 1: throw new FormatException("Invalid base64url string.");
            }
            return Convert.FromBase64String(s);
        }
    }
}
