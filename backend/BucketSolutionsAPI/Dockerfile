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

# Expose the port the API will listen on inside the container
EXPOSE 80

# Command to run the application
ENTRYPOINT ["dotnet", "BucketSolutionsAPI.dll"]