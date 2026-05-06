var builder = WebApplication.CreateBuilder(args);

// --- 1. PREPARE SERVICES ---
builder.Services.AddControllers();

// Add the CORS Policy (Tells the frontend it is allowed to connect)
builder.Services.AddCors(options => {
    options.AddPolicy("AllowAll", policy => {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// --- 2. TRAFFIC PIPELINE (ORDER IS CRITICAL) ---
app.UseCors("AllowAll"); // This MUST be first!

app.UseAuthorization();

app.MapControllers();

app.Run();