# Racelith Penalty Tracking System

A full-stack race control and penalty management system built for Dubai Kartdrome to streamline endurance event operations.
The system enables live tracking of infringements, penalties, and race sessions, complete with real-time WebSocket updates, multi-session database handling, and intuitive dashboards for race officials.

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Infrastructure**: Docker, Nginx, WebSocket
- **Database Management**: Dynamic per-session PostgreSQL databases with live switching

## Key Features

- Session-based race event tracking (start, load, close, delete sessions)
- Automated infringement logic with warning and penalty accumulation
- Real-time WebSocket event updates to all connected dashboards
- Race control workflows for officials (server authentication remains deferred)
- Dockerized architecture for reproducible and scalable deployments

## Quick Start (Docker - One Command)

### Prerequisites
- Docker and Docker Compose installed
- Ports 3000, 8000, and 5432 available

### Setup and Run

**Option 1: Quick setup (Recommended for first time)**
```bash
# Run setup script (makes scripts executable and creates directories)
./setup.sh

# Then start the application
./start.sh
```

**Option 2: Direct startup**
```bash
# Make script executable (if needed)
chmod +x start.sh

# Run the application
./start.sh
```

**Option 3: Manual setup**
```bash
# 1. Create the environment file
cp backend/.env.example backend/.env

# 2. Edit backend/.env and change the default password:
#    POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD
#    DATABASE_URL=postgresql://racelith_user:CHANGE_THIS_PASSWORD@db:5432/racelith_db

# 3. Build and run everything
docker-compose up --build -d
```

This will:
- Build the PostgreSQL database container
- Build the FastAPI backend container  
- Build the React frontend container
- Start all services with proper dependencies and health checks
- Set up the database automatically
- Wait for services to be ready before starting dependent services

### Access the application:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation (Swagger)**: http://localhost:8000/docs
- **Database**: localhost:5432 (only exposed for development)

### View logs:
```bash
docker-compose logs -f
```

### Stop the application:
```bash
docker-compose down
```

### Backups (CRITICAL for Production):
```bash
# Manual backup (backs up all databases)
./backup.sh

# Automated daily backup (add to crontab)
0 2 * * * cd /path/to/project && ./backup.sh

# Restore from backup (if needed)
./restore.sh backups/db_all_YYYYMMDD_HHMMSS.sql.gz
```

## Production Readiness 

The repository includes the following deployment features. Local regression checks do not establish production readiness; authentication and deployed-container verification remain outstanding:

-  **Health checks** for all services
-  **Database initialization** and waiting scripts
-  **Configurable CORS** for security
-  **Environment-based configuration**
-  **Docker networking** for service isolation
-  **Nginx configuration** for frontend
-  **Security headers** and optimizations
-  **Production Docker Compose** override file
-  **Database backups** support
-  **Logging** configuration
-  **Restart policies** for high availability

### Before Deploying to Production:

1. **Change default passwords** in `backend/.env`
2. **Configure CORS_ORIGINS** with your domain (not `*`)
3. **Set VITE_API_BASE** to your production backend URL
4. **Review security settings** in `DEPLOYMENT.md`
5. **Set up SSL/TLS** certificates
6. **Configure backups** for the database
7. **Set up monitoring** and logging

See `DEPLOYMENT.md` for detailed production deployment instructions.

## Development Setup (Local)

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.lock
   ```

4. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

5. Start PostgreSQL (via Docker or local installation):
   ```bash
   docker-compose up db -d
   ```

6. Run the backend:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file (optional, defaults to http://localhost:8000):
   ```bash
   echo "VITE_API_BASE=http://localhost:8000" > .env
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## Environment Variables

### Backend (.env)
- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://user:password@db:5432/dbname`)
- `POSTGRES_USER`: PostgreSQL username
- `POSTGRES_PASSWORD`: PostgreSQL password
- `POSTGRES_DB`: PostgreSQL database name

### Frontend (.env)
- `VITE_API_BASE`: Backend API URL (default: `http://localhost:8000`)

## Usage

1. **Start a Session**: Use the Session Manager in the frontend to create or load a session
2. **Log Infringements**: Use the infringement form to log new violations
3. **View Pending Penalties**: Check the pending penalties panel for actions required
4. **Apply Penalties**: Click "Apply Penalty" to mark penalties as applied
5. **View History**: All actions are tracked in the infringement log

## API Endpoints

- `GET /infringements/` - List all infringements
- `POST /infringements/` - Create new infringement
- `PUT /infringements/{id}` - Update infringement
- `DELETE /infringements/{id}` - Delete infringement
- `GET /penalties/pending` - Get pending penalties
- `POST /penalties/apply_individual/{id}` - Apply individual penalty
- `GET /session/` - List all sessions
- `POST /session/start?name={name}` - Start new session
- `POST /session/load?name={name}` - Load existing session
- `WS /ws` - WebSocket for real-time updates

Full API documentation available at `/docs` when the backend is running.

## Impact

- Reduced manual penalty reconciliation time by approximately 70%
- Established a reusable framework for future event automation at Dubai Kartdrome

## October 2026 reliability fixes and verification

The non-authentication fixes and repeated real-browser/API/database test results are documented in `audit/FIX_REPORT.txt`. Original pre-fix evidence remains in `audit/AUDIT_REPORT.txt`.

Use Python 3.12 and install `backend/requirements.lock`; the backend now explicitly selects the installed psycopg2 driver. In `frontend`, run `npm ci`, `npm run typecheck`, and `npm run build` using the updated lockfile. Generated dependencies and builds are not the source of truth. Production Compose requires version 2.24.4 or newer for the explicit inherited-port and volume overrides.

Existing session databases receive additive columns on first load. New sessions use independent database identifiers. Deleted incidents remain in the audit/export data; list views hide them. Correcting a warning rebuilds the affected warning cycle in event order, while penalties already served stay served and may require review.

Run the regression scripts only against a disposable database with `RACELITH_AUDIT_DISPOSABLE=1`. They create sessions, modify data, and inject database failures. `regression_faults.py` also modifies the disposable cluster's template database; never run it on an event or shared PostgreSQL server.
