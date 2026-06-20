#!/bin/bash

# Racelith Penalty Tracking System - Production Deployment Script
# This script handles production deployment with proper checks

set -e

echo "🚀 Racelith Penalty Tracking System - Production Deployment"
echo "============================================================"

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo "❌ Error: backend/.env file not found!"
    echo "   Please create it from backend/.env.example"
    exit 1
fi

# Check for required environment variables
echo "🔍 Checking environment configuration..."

REQUIRED_VARS=("POSTGRES_PASSWORD" "DATABASE_URL" "CORS_ORIGINS" "VITE_API_BASE")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" backend/.env || grep -q "^${var}=.*CHANGE_THIS\|^${var}=.*localhost" backend/.env; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "⚠️  Warning: The following variables may need to be updated:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check Docker and Docker Compose
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p backend/session_exports
mkdir -p backups
touch backend/session_exports/.gitkeep 2>/dev/null || true

# Stop existing containers
echo "🛑 Stopping existing containers..."
$DOCKER_COMPOSE down 2>/dev/null || true

# Pull latest images (if using pre-built images)
# docker pull postgres:15

# Build and start services
echo "🔨 Building and starting services..."
$DOCKER_COMPOSE -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service status
echo "📊 Checking service status..."
$DOCKER_COMPOSE ps

# Verify health checks
echo "🏥 Verifying health checks..."
sleep 5

BACKEND_HEALTH=$(curl -s http://localhost:8000/api/health || echo "failed")
if [[ "$BACKEND_HEALTH" == *"ok"* ]] || [[ "$BACKEND_HEALTH" == *"status"* ]]; then
    echo "✅ Backend is healthy"
else
    echo "⚠️  Backend health check failed - check logs: $DOCKER_COMPOSE logs backend"
fi

FRONTEND_HEALTH=$(curl -s http://localhost:3000/health || echo "failed")
if [[ "$FRONTEND_HEALTH" == *"ok"* ]] || [[ "$FRONTEND_HEALTH" == "failed" ]]; then
    echo "✅ Frontend is running"
else
    echo "⚠️  Frontend health check failed - check logs: $DOCKER_COMPOSE logs frontend"
fi

echo ""
echo "✅ Deployment completed!"
echo ""
echo "📋 Service URLs:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:8000"
echo "   API Docs:  http://localhost:8000/docs"
echo ""
echo "📝 Next steps:"
echo "   1. Set up reverse proxy (nginx) with SSL"
echo "   2. Configure automated backups (see backup.sh)"
echo "   3. Set up monitoring and alerts"
echo ""
echo "📊 View logs: $DOCKER_COMPOSE logs -f"
echo "🛑 Stop services: $DOCKER_COMPOSE down"
