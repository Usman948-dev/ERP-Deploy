using System;
using System.Collections.Generic;
using BucketSolutionsAPI.Security;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace BucketSolutionsAPI.Tests
{
    public class TokenServiceTests
    {
        // A fresh, isolated in-memory config for each test — mirrors what
        // Program.cs reads from appsettings.json / the Auth__SigningKey
        // environment variable in the real app, without needing either.
        private static IConfiguration MakeConfig(string signingKey = "test-signing-key-at-least-32-characters-long")
        {
            return new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Auth:SigningKey"] = signingKey
                })
                .Build();
        }

        [Fact]
        public void CreateToken_ThenValidateToken_ReturnsTheOriginalUsernameAndRole()
        {
            var config = MakeConfig();

            string token = TokenService.CreateToken(config, "alice", "Admin", TimeSpan.FromHours(1));
            var payload = TokenService.ValidateToken(config, token);

            Assert.NotNull(payload);
            Assert.Equal("alice", payload!.Username);
            Assert.Equal("Admin", payload.Role);
        }

        [Fact]
        public void ValidateToken_WithATamperedSignature_ReturnsNull()
        {
            var config = MakeConfig();
            string token = TokenService.CreateToken(config, "alice", "Admin", TimeSpan.FromHours(1));

            // Flip the last character of the signature half of the token —
            // simulates someone trying to forge/modify a token.
            string tampered = token.Substring(0, token.Length - 1) +
                (token[token.Length - 1] == 'A' ? 'B' : 'A');

            Assert.Null(TokenService.ValidateToken(config, tampered));
        }

        [Fact]
        public void ValidateToken_SignedWithADifferentKey_ReturnsNull()
        {
            // A token signed with one key must never validate against a
            // different key — this is what makes rotating AUTH_SIGNING_KEY
            // correctly invalidate all previously-issued tokens.
            string token = TokenService.CreateToken(MakeConfig("key-one-at-least-32-characters-long"), "alice", "Admin", TimeSpan.FromHours(1));

            Assert.Null(TokenService.ValidateToken(MakeConfig("key-two-at-least-32-characters-long"), token));
        }

        [Fact]
        public void ValidateToken_ThatHasAlreadyExpired_ReturnsNull()
        {
            var config = MakeConfig();
            // Negative lifetime = already expired the instant it's created.
            string token = TokenService.CreateToken(config, "alice", "Admin", TimeSpan.FromSeconds(-1));

            Assert.Null(TokenService.ValidateToken(config, token));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("not-a-real-token")]
        [InlineData("only.one.dot.but.still.garbage")]
        [InlineData("!!!not-valid-base64!!!.also-not-valid!!!")]
        public void ValidateToken_OnGarbageInput_ReturnsNullRatherThanThrowing(string? garbage)
        {
            var config = MakeConfig();

            Assert.Null(TokenService.ValidateToken(config, garbage));
        }

        [Fact]
        public void CreateToken_WithoutASigningKeyConfigured_ThrowsRatherThanIssuingAnUnsignedToken()
        {
            var emptyConfig = new ConfigurationBuilder().Build();

            Assert.Throws<InvalidOperationException>(() =>
                TokenService.CreateToken(emptyConfig, "alice", "Admin", TimeSpan.FromHours(1)));
        }
    }
}
