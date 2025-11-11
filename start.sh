#!/bin/bash

# Kronos Karting Infringement System - Startup Script
# This script sets up and starts the entire application

set -e

echo "🚀 Starting Kronos Karting Infringement System..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo "⚠️  No .env file found. Creating default .env file..."
    cat > backend/.env << EOF
# PostgreSQL Database Configuration
DATABASE_URL=postgresql://kronos_user:CHANGE_THIS_PASSWORD@db:5432/kronos_db

# PostgreSQL Environment Variables
POSTGRES_USER=kronos_user
POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD
POSTGRES_DB=kronos_db

# CORS Configuration (use * for development, specific domains for production)
CORS_ORIGINS=*

# Frontend API URL (for build-time configuration)
VITE_API_BASE=http://localhost:8000

# Environment
ENVIRONMENT=production
EOF
    echo "✅ Created backend/.env file with default values"
    echo "⚠️  IMPORTANT: For production, please edit backend/.env and change the default passwords!"
    echo "   For development/testing, you can continue with the defaults."
    read -p "Press Enter to continue, or Ctrl+C to abort and edit .env file..."
fi

# Create session_exports directory if it doesn't exist
mkdir -p backend/session_exports

# Create .gitkeep if directory is empty
if [ ! -f "backend/session_exports/.gitkeep" ]; then
    touch backend/session_exports/.gitkeep
fi

# Determine which docker-compose command to use
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Build and start services
echo "📦 Building and starting containers..."
$DOCKER_COMPOSE up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if services are running
if $DOCKER_COMPOSE ps | grep -q "Up"; then
    echo "✅ Services are starting up!"
    echo ""
    echo "📋 Service URLs:"
    echo "   Frontend:  http://localhost:3000"
    echo "   Backend:   http://localhost:8000"
    echo "   API Docs:  http://localhost:8000/docs"
    echo ""
    echo "📊 View logs: $DOCKER_COMPOSE logs -f"
    echo "🛑 Stop services: $DOCKER_COMPOSE down"
    echo ""
    echo "🎉 Setup complete! The application is starting up."
    echo ""
    echo "📝 Next steps:"
    echo "   1. Open http://localhost:3000 in your browser"
    echo "   2. Create a session using the Session Manager"
    echo "   3. Start logging infringements"
else
    echo "❌ Failed to start services. Check logs with: $DOCKER_COMPOSE logs"
    exit 1
fi
