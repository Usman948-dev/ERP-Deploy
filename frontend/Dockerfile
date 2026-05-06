# Stage 1: Build the React App
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Use npm ci for faster, more reliable builds
RUN npm ci 
COPY . .
# Assuming you are using Vite; change to 'npm run build' if using Create React App
RUN npm run build 

# Stage 2: Serve the App with Nginx
FROM nginx:alpine
# Copy the built files from Stage 1. 
# Important: Vite outputs to 'dist'. Create React App outputs to 'build'. Adjust if necessary.
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80 inside the container
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]