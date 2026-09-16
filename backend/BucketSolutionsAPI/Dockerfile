# Stage 1: Build the .NET App
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy the project file and restore dependencies
COPY ["BucketSolutionsAPI.csproj", "./"]
RUN dotnet restore "BucketSolutionsAPI.csproj"

# Copy the rest of the code and build
COPY . .
RUN dotnet build "BucketSolutionsAPI.csproj" -c Release -o /app/build
RUN dotnet publish "BucketSolutionsAPI.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: Run the App
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Explicitly set the listen port rather than relying on the base image's
# default (this used to say EXPOSE 80 while docker-compose mapped 5001:8080 —
# it happened to work because .NET 8+ base images default to 8080, but that
# was undocumented here and easy to break on a base image change).
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

# Command to run the application
ENTRYPOINT ["dotnet", "BucketSolutionsAPI.dll"]