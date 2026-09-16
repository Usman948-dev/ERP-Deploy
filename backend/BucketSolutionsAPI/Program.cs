using BucketSolutionsAPI;
using BucketSolutionsAPI.Common;
using BucketSolutionsAPI.Security;
using Microsoft.AspNetCore.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

// --- 1. PREPARE SERVICES ---
builder.Services.AddControllers();

// --- CORS: restricted to known frontend origins (was previously AllowAnyOrigin,
// which let any website on the internet call this API from a user's browser).
// Configure via appsettings.json "Cors:AllowedOrigins" (comma-separated), or
// override with the Cors__AllowedOrigins environment variable.
var allowedOrigins = (builder.Configuration["Cors:AllowedOrigins"] ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options => {
    options.AddPolicy("AppFrontend", policy => {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        }
        else
        {
            // No origins configured — fail safe to "no cross-origin access"
            // rather than silently falling back to AllowAnyOrigin.
            policy.WithOrigins(Array.Empty<string>());
        }
    });
});

// --- AUTHENTICATION: lightweight signed-token scheme (see Security/TokenService.cs).
// Every controller requires a valid token by default (see MapControllers().RequireAuthorization()
// below) except endpoints explicitly marked [AllowAnonymous], i.e. login.
builder.Services.AddAuthentication("SimpleToken")
    .AddScheme<SimpleTokenAuthOptions, SimpleTokenAuthHandler>("SimpleToken", null);
builder.Services.AddAuthorization();

// --- EMAIL: used for password-reset links (see Security/EmailService.cs
// and AuthController.ForgotPassword). Configure via appsettings.json "Smtp"
// section, or Smtp__* environment variables. If left unconfigured, emails
// are skipped with a logged warning rather than the app failing to start —
// see EmailService.IsConfigured.
builder.Services.AddSingleton<IEmailService, SmtpEmailService>();

// --- GLOBAL EXCEPTION HANDLING: defense-in-depth.
// Every controller action already has its own try/catch that logs the real
// exception and returns a safe generic message (see Common/BusinessRuleException.cs
// for how expected validation errors are told apart from unexpected ones).
// This global handler exists for anything that somehow escapes that anyway —
// e.g. future code that forgets to wrap a new endpoint — so the failure mode
// is always "logged + generic 500", never a stack trace or raw exception
// message reaching the client.
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

var app = builder.Build();

// --- 2. TRAFFIC PIPELINE (ORDER IS CRITICAL) ---
app.UseExceptionHandler(); // delegates to GlobalExceptionHandler below (requires AddProblemDetails() above)
app.UseCors("AppFrontend");

app.UseAuthentication();
app.UseAuthorization();

// Require a valid auth token on every endpoint by default. Individual actions
// (currently just AuthController.Login) opt out with [AllowAnonymous].
app.MapControllers().RequireAuthorization();

app.Run();

namespace BucketSolutionsAPI
{
    // Registered above via AddExceptionHandler<T>(). ASP.NET Core calls
    // TryHandleAsync for any exception that reaches the middleware pipeline
    // without already having been turned into a response.
    public class GlobalExceptionHandler : IExceptionHandler
    {
        private readonly ILogger<GlobalExceptionHandler> _logger;

        public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
        {
            _logger = logger;
        }

        public async ValueTask<bool> TryHandleAsync(
            HttpContext httpContext,
            Exception exception,
            CancellationToken cancellationToken)
        {
            // BusinessRuleException reaching all the way here (rather than being
            // caught locally) still shouldn't leak a stack trace, but its message
            // IS meant to be user-facing, so it gets a 400 with its own text.
            if (exception is BusinessRuleException businessEx)
            {
                _logger.LogWarning(businessEx, "Unhandled BusinessRuleException reached the global handler");
                httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                await httpContext.Response.WriteAsJsonAsync(new { error = businessEx.Message }, cancellationToken);
                return true;
            }

            _logger.LogError(exception, "Unhandled exception reached the global exception handler at {Path}", httpContext.Request.Path);
            httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await httpContext.Response.WriteAsJsonAsync(
                new { error = "Something went wrong on our end. Please try again." },
                cancellationToken);
            return true;
        }
    }
}
