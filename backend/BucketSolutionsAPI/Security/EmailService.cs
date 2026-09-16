using System;
using System.Net;
using System.Net.Mail;
using System.Threading.Tasks;

namespace BucketSolutionsAPI.Security
{
    // Sends email using System.Net.Mail.SmtpClient — part of the .NET base
    // class library, so this needs no new NuGet package (consistent with the
    // rest of Security/: TokenService and PasswordHasher made the same
    // choice, since this project couldn't verify a NuGet restore when it was
    // written). Works with any provider that offers plain SMTP + username/
    // password credentials (Gmail app passwords, SendGrid, Mailgun, Amazon
    // SES, Postmark, your host's own mail server, etc).
    //
    // Microsoft's own docs note SmtpClient is not under active feature
    // development (it predates async/await and modern OAuth flows) — if you
    // later need OAuth-based auth (e.g. "Sign in with Google" for sending,
    // rather than an app password) or more robust retry/queueing behavior,
    // MailKit is the commonly recommended replacement. This class's
    // interface (SendAsync) was kept deliberately minimal so swapping the
    // implementation later doesn't require touching any calling code.
    public interface IEmailService
    {
        Task SendAsync(string toAddress, string subject, string bodyHtml);
    }

    public class SmtpEmailService : IEmailService
    {
        private readonly IConfiguration _config;
        private readonly ILogger<SmtpEmailService> _logger;

        public SmtpEmailService(IConfiguration config, ILogger<SmtpEmailService> logger)
        {
            _config = config;
            _logger = logger;
        }

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(_config["Smtp:Host"]) &&
            !string.IsNullOrWhiteSpace(_config["Smtp:FromAddress"]);

        public async Task SendAsync(string toAddress, string subject, string bodyHtml)
        {
            if (!IsConfigured)
            {
                // Deliberately does not throw: a misconfigured mail server
                // shouldn't take down the forgot-password endpoint (which
                // always returns a generic success response regardless, so
                // as not to reveal whether an email exists — see
                // AuthController.ForgotPassword). Logged loudly instead so
                // it's obvious in the logs why no email actually went out.
                _logger.LogWarning(
                    "SmtpEmailService is not configured (Smtp:Host / Smtp:FromAddress missing) — " +
                    "skipped sending email to {ToAddress} with subject '{Subject}'. " +
                    "Set Smtp:Host, Smtp:Port, Smtp:Username, Smtp:Password, Smtp:FromAddress " +
                    "in appsettings.json or via Smtp__* environment variables.",
                    toAddress, subject);
                return;
            }

            string host = _config["Smtp:Host"]!;
            int port = int.TryParse(_config["Smtp:Port"], out int p) ? p : 587;
            string? username = _config["Smtp:Username"];
            string? password = _config["Smtp:Password"];
            string fromAddress = _config["Smtp:FromAddress"]!;
            string fromName = _config["Smtp:FromName"] ?? "ERP System";
            bool enableSsl = !bool.TryParse(_config["Smtp:EnableSsl"], out bool ssl) || ssl; // default true

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = enableSsl,
                Credentials = string.IsNullOrEmpty(username)
                    ? null
                    : new NetworkCredential(username, password)
            };

            using var message = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = bodyHtml,
                IsBodyHtml = true
            };
            message.To.Add(toAddress);

            try
            {
                await client.SendMailAsync(message);
            }
            catch (Exception ex)
            {
                // Same reasoning as above: log, don't throw, so a mail-server
                // hiccup can't turn into a leaked-internals 500 on an
                // endpoint that's intentionally always-succeeds-looking.
                _logger.LogError(ex, "Failed to send email to {ToAddress}", toAddress);
            }
        }
    }
}
