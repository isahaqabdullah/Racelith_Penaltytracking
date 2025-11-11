# Quick Setup Guide

## One-Command Setup

```bash
./start.sh
```

This script will:
1. Check for Docker and Docker Compose
2. Create `.env` file from template if it doesn't exist
3. Set up required directories
4. Build and start all services
5. Display access URLs

## Manual Setup

### 1. Create Environment File

Create `backend/.env` with the following content:

```env
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
```

**⚠️ IMPORTANT**: Change `CHANGE_THIS_PASSWORD` to a strong password before deploying!

### 2. Run Application

```bash
docker-compose up --build -d
```

### 3. Access Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Troubleshooting

### Port Already in Use

If ports 3000, 8000, or 5432 are already in use, you can change them in `backend/.env`:

```env
FRONTEND_PORT=3001
BACKEND_PORT=8001
DB_PORT=5433
```

### Services Won't Start

1. Check logs: `docker-compose logs`
2. Verify `.env` file exists in `backend/` directory
3. Check Docker has enough resources (RAM, disk space)
4. Verify ports are available

### Database Connection Issues

1. Ensure DATABASE_URL matches POSTGRES_* variables
2. Check database container is running: `docker-compose ps db`
3. View database logs: `docker-compose logs db`

## Next Steps

1. **Create a Session**: Use the Session Manager in the frontend
2. **Start Logging**: Use the infringement form to log violations
3. **Monitor**: Check the pending penalties panel
4. **Review**: See all infringements in the log table

For production deployment, see `DEPLOYMENT.md`.

