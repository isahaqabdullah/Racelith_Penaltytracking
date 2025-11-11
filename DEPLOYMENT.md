# Production Deployment Guide

## Prerequisites

- Docker and Docker Compose installed
- Server with at least 2GB RAM and 10GB disk space
- Domain name (optional, for production)
- SSL certificate (optional, recommended for production)

## Quick Start (Single Command)

### 1. Setup Environment

```bash
# Copy environment template
cp backend/.env.example backend/.env

# Edit backend/.env and change:
# - POSTGRES_PASSWORD (use a strong password)
# - DATABASE_URL (update password in connection string)
# - CORS_ORIGINS (set to your domain, e.g., https://yourdomain.com)
# - VITE_API_BASE (set to your backend URL, e.g., https://api.yourdomain.com)
```

### 2. Run the Application

**Option A: Using the startup script (recommended)**
```bash
./start.sh
```

**Option B: Using Docker Compose directly**
```bash
docker-compose up --build -d
```

### 3. Access the Application

- **Frontend**: http://localhost:3000 (or your domain)
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## Production Deployment

### 1. Environment Configuration

Create `backend/.env` with production values:

```env
# Database Configuration
DATABASE_URL=postgresql://kronos_user:STRONG_PASSWORD_HERE@db:5432/kronos_db
POSTGRES_USER=kronos_user
POSTGRES_PASSWORD=STRONG_PASSWORD_HERE
POSTGRES_DB=kronos_db

# CORS Configuration (comma-separated list)
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Frontend API URL
VITE_API_BASE=https://api.yourdomain.com

# Environment
ENVIRONMENT=production

# Optional: Custom ports
DB_PORT=5432
BACKEND_PORT=8000
FRONTEND_PORT=3000
```

### 2. Security Considerations

#### Database Security
- Change the default database password
- Consider not exposing database port (5432) in production
- Use strong, unique passwords
- Regularly backup the database

#### CORS Configuration
- Never use `*` for CORS_ORIGINS in production
- Specify exact domains that should access the API
- Use HTTPS in production

#### Network Security
- Use a reverse proxy (nginx/traefik) in front of the application
- Enable SSL/TLS certificates
- Configure firewall rules
- Consider using Docker networks for internal communication only

### 3. Using Reverse Proxy (Nginx Example)

Create an nginx configuration:

```nginx
# Frontend
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 4. Production Docker Compose

For production, use the production override:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This will:
- Remove database port exposure (or bind to localhost only)
- Add logging configuration
- Use production environment variables
- Optimize for production workloads

### 5. SSL/TLS Setup

#### Using Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### 6. Database Backups

#### Manual Backup

```bash
# Backup database
docker-compose exec db pg_dump -U kronos_user kronos_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore database
docker-compose exec -T db psql -U kronos_user kronos_db < backup.sql
```

#### Automated Backups

Create a backup script (`backup.sh`):

```bash
#!/bin/bash
BACKUP_DIR="./backups"
mkdir -p $BACKUP_DIR
docker-compose exec -T db pg_dump -U kronos_user kronos_db | gzip > $BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql.gz
# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

Add to crontab:
```bash
0 2 * * * /path/to/backup.sh
```

## Monitoring and Maintenance

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db
```

### Check Service Status

```bash
docker-compose ps
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend
```

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up --build -d

# Or using the startup script
./start.sh
```

### Health Checks

The application includes health checks:
- Backend: `GET /api/health`
- Frontend: `GET /health`
- Database: PostgreSQL readiness check

Check health status:
```bash
docker-compose ps
```

## Troubleshooting

### Services won't start

1. Check logs: `docker-compose logs`
2. Verify .env file exists and has correct values
3. Check port availability: `netstat -tulpn | grep -E '3000|8000|5432'`
4. Verify Docker has enough resources

### Database connection errors

1. Verify DATABASE_URL in .env matches POSTGRES_* variables
2. Check database is healthy: `docker-compose ps db`
3. Check database logs: `docker-compose logs db`

### Frontend can't connect to backend

1. Verify VITE_API_BASE in .env
2. Check CORS_ORIGINS includes frontend domain
3. Verify backend is running: `curl http://localhost:8000/api/health`
4. Check network connectivity between containers

### Permission errors

1. Ensure scripts are executable: `chmod +x start.sh backend/wait-for-db.sh`
2. Check file permissions on session_exports directory
3. Verify Docker has permissions to access volumes

## Scaling

For higher traffic, consider:

1. **Load Balancer**: Add nginx/traefik in front
2. **Multiple Backend Instances**: Scale backend service
3. **Database Replication**: Set up PostgreSQL replication
4. **Caching**: Add Redis for session/cache management
5. **CDN**: Use CDN for static frontend assets

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Verify configuration in `backend/.env`
3. Check health endpoints
4. Review this deployment guide

