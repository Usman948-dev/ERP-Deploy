using BucketSolutionsAPI.Security;
using Xunit;

namespace BucketSolutionsAPI.Tests
{
    public class PasswordHasherTests
    {
        [Fact]
        public void Hash_ThenVerify_WithCorrectPassword_ReturnsTrue()
        {
            string hash = PasswordHasher.Hash("correct-horse-battery-staple");

            Assert.True(PasswordHasher.Verify("correct-horse-battery-staple", hash));
        }

        [Fact]
        public void Verify_WithWrongPassword_ReturnsFalse()
        {
            string hash = PasswordHasher.Hash("the-real-password");

            Assert.False(PasswordHasher.Verify("a-guessed-password", hash));
        }

        [Fact]
        public void Hash_ProducesADifferentStringEachTime_BecauseOfRandomSalt()
        {
            // Two hashes of the SAME password must never be identical — if they
            // were, it would mean the salt isn't actually random, which defeats
            // the point of salting (identical passwords would be visibly
            // identical in the database).
            string hash1 = PasswordHasher.Hash("same-password");
            string hash2 = PasswordHasher.Hash("same-password");

            Assert.NotEqual(hash1, hash2);
            // But both must still verify correctly against the same password.
            Assert.True(PasswordHasher.Verify("same-password", hash1));
            Assert.True(PasswordHasher.Verify("same-password", hash2));
        }

        [Fact]
        public void IsHashed_OnAHashedPassword_ReturnsTrue()
        {
            string hash = PasswordHasher.Hash("anything");

            Assert.True(PasswordHasher.IsHashed(hash));
        }

        [Theory]
        [InlineData("plaintext-password")]
        [InlineData("")]
        [InlineData(null)]
        public void IsHashed_OnAnythingNotProducedByHash_ReturnsFalse(string? notAHash)
        {
            // This is what makes the legacy-plaintext-password migration in
            // AuthController.Login work: anything that isn't in our hash format
            // is treated as a legacy plaintext row.
            Assert.False(PasswordHasher.IsHashed(notAHash));
        }

        [Fact]
        public void Verify_OnALegacyPlaintextValue_ReturnsFalseRatherThanThrowing()
        {
            // Verify must never be called directly on a plaintext value in real
            // code (AuthController checks IsHashed first) — but it should fail
            // safe rather than throw if it ever is.
            Assert.False(PasswordHasher.Verify("password123", "password123"));
        }

        [Theory]
        [InlineData("PBKDF2$not-enough-parts")]
        [InlineData("PBKDF2$100000$not-valid-base64!!!$also-not-base64!!!")]
        [InlineData("PBKDF2$notanumber$c2FsdA==$aGFzaA==")]
        public void Verify_OnACorruptedOrMalformedHash_ReturnsFalseRatherThanThrowing(string corrupted)
        {
            Assert.False(PasswordHasher.Verify("any-password", corrupted));
        }
    }
}
