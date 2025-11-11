# Stage 1: Build the React app
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package.json package-lock.json* ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build arguments for API URL
ARG VITE_API_BASE=http://localhost:8000
ENV VITE_API_BASE=$VITE_API_BASE

# Build the app
RUN npm run build

# Stage 2: Serve the built app using a lightweight web server
FROM nginx:alpine

# Copy the Vite build output to Nginx HTML directory
COPY --from=builder /app/build /usr/share/nginx/html

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
