var builder = WebApplication.CreateBuilder(args);

// --- 1. PREPARE SERVICES ---
builder.Services.AddControllers();

// Add the CORS Policy (Tells the bouncer to allow your React tunnel)
builder.Services.AddCors(options => {
    options.AddPolicy("AllowAll", policy => {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// --- 2. TRAFFIC PIPELINE (ORDER IS CRITICAL) ---

// This MUST be the very first thing in the pipeline!
app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers();

app.Run();