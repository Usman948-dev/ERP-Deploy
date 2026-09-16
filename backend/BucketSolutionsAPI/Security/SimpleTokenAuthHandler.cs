using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BucketSolutionsAPI.Security
{
    public class SimpleTokenAuthOptions : AuthenticationSchemeOptions { }

    // Validates the "Authorization: Bearer <token>" header on every request
    // against TokenService, and builds the ClaimsPrincipal ([Authorize],
    // [Authorize(Roles = "Admin")], User.Identity.Name, etc. all work off this).
    public class SimpleTokenAuthHandler : AuthenticationHandler<SimpleTokenAuthOptions>
    {
        private readonly IConfiguration _config;

        public SimpleTokenAuthHandler(
            IOptionsMonitor<SimpleTokenAuthOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder,
            IConfiguration config)
            : base(options, logger, encoder)
        {
            _config = config;
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("Authorization", out var authHeaderValues))
                return Task.FromResult(AuthenticateResult.NoResult());

            var raw = authHeaderValues.ToString();
            if (string.IsNullOrWhiteSpace(raw) || !raw.StartsWith("Bearer "))
                return Task.FromResult(AuthenticateResult.NoResult());

            var token = raw.Substring("Bearer ".Length).Trim();
            var payload = TokenService.ValidateToken(_config, token);
            if (payload == null)
                return Task.FromResult(AuthenticateResult.Fail("Invalid or expired token."));

            var claims = new[]
            {
                new Claim(ClaimTypes.Name, payload.Username),
                new Claim(ClaimTypes.Role, payload.Role)
            };
            var identity = new ClaimsIdentity(claims, Scheme.Name);
            var principal = new ClaimsPrincipal(identity);
            var ticket = new AuthenticationTicket(principal, Scheme.Name);

            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }
}
