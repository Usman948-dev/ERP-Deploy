using System;
using System.Security.Cryptography;

namespace BucketSolutionsAPI.Security
{
    // PBKDF2 password hashing using System.Security.Cryptography.Rfc2898DeriveBytes,
    // which ships in the .NET base class library — no NuGet package required.
    //
    // Stored format: "PBKDF2${iterations}${base64(salt)}${base64(hash)}"
    // Anything NOT in that format is treated as a legacy plaintext password
    // (see IsHashed below) so existing users in the DB can keep logging in;
    // AuthController re-hashes their password the moment they log in successfully,
    // so the plaintext value in the DB is replaced automatically over time.
    public static class PasswordHasher
    {
        private const string Prefix = "PBKDF2";
        private const int SaltSize = 16;
        private const int HashSize = 32;
        private const int Iterations = 100_000;

        public static bool IsHashed(string? stored) =>
            !string.IsNullOrEmpty(stored) && stored.StartsWith(Prefix + "$", StringComparison.Ordinal);

        public static string Hash(string password)
        {
            byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);
            byte[] hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);
            return $"{Prefix}${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
        }

        public static bool Verify(string password, string stored)
        {
            if (!IsHashed(stored)) return false;

            var parts = stored.Split('$');
            // "PBKDF2", iterations, salt, hash
            if (parts.Length != 4) return false;

            if (!int.TryParse(parts[1], out int iterations)) return false;

            byte[] salt;
            byte[] expectedHash;
            try
            {
                salt = Convert.FromBase64String(parts[2]);
                expectedHash = Convert.FromBase64String(parts[3]);
            }
            catch
            {
                return false;
            }

            byte[] actualHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expectedHash.Length);
            return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
        }
    }
}
