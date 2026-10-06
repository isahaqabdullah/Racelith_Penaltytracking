# Racelith Penalty Tracking System

Race control app for managing karting sessions, infringements, warnings, penalties and audit history. The app uses React, FastAPI and PostgreSQL, with live updates between dashboards.

## Do I need a separate Docker image?

No manual image build or Docker Hub upload is needed. The repository already includes the backend and frontend Dockerfiles. The startup command below builds those images on your computer, downloads the PostgreSQL image, and starts all three services. The first run needs an internet connection and takes longer while dependencies download.

Docker must be installed and running on the computer hosting the app. Anyone using the app from a browser does not need Docker, Python or Node.js installed. See [Docker's startup documentation](https://docs.docker.com/reference/cli/docker/compose/up/) for what `up --build` does.

## Run with Docker (recommended)

### 1. Install and start Docker

Use Docker Desktop on macOS or Windows, or Docker Engine with the Compose plugin on Linux. Start Docker before continuing. Use **Docker Compose 2.24.4 or newer**; the override file uses syntax that removes the inherited database port mapping.

Check your installation:

```bash
docker --version
docker compose version
```

Ports **3000** and **8000** must be available. PostgreSQL stays inside Docker with the startup command below, so this setup does not need host port 5432.

### 2. Open the project folder

For a new checkout:

```bash
git clone https://github.com/isahaqabdullah/Racelith_Penaltytracking.git
cd Racelith_Penaltytracking
```

For an existing checkout, open a terminal in the folder containing this README and `docker-compose.yml`. Keep your existing environment file and database credentials.

### 3. Configure the environment

Copy `backend/.env.example` to `backend/.env` **if that file does not already exist**. On macOS/Linux or Windows Git Bash:

```bash
cp -n backend/.env.example backend/.env
```

In Windows PowerShell, use:

```powershell
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

Open `backend/.env` in a text editor. On a new installation, replace `replace_this_with_a_long_random_password` with a password containing letters and numbers. The template's `DATABASE_URL` references `POSTGRES_PASSWORD`, so those values stay in sync. Existing installations should keep the credentials their database already uses.

Keep these values for local use:

```dotenv
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
VITE_API_BASE=http://localhost:8000
FRONTEND_PORT=3000
BACKEND_PORT=8000
```

Use `--env-file backend/.env` in the commands below. This supplies the values used by Compose itself as well as the containers. [Docker documents this environment-file behavior here](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/). Your actual `.env` file is excluded from Git.

### 4. Build and start the app

Run this from the root project folder:

```bash
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

This builds the frontend and backend, starts PostgreSQL, and waits for database/API readiness before starting dependent services. Database tables initialize automatically. You do not need to run `setup.sh`, `start.sh`, a separate image-build command, or manual SQL migrations.

Check the services:

```bash
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.prod.yml ps
```

The services are `db`, `backend`, and `frontend`. Allow time for the health checks to turn healthy, then open:

- **Application:** [http://localhost:3000](http://localhost:3000)
- **API documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Database readiness:** [http://localhost:8000/api/ready](http://localhost:8000/api/ready)

A ready API returns `{"status":"ok"}`. A database outage returns HTTP 503 from `/api/ready`; `/api/live` checks the API process separately.

### 5. Start using it

1. Create a session using **New Session**, or load an existing one.
2. Enter the kart number(s), infringement, observer and penalty, then log the entry.
3. Apply pending penalties after they have been served.
4. Use the log to search, edit and inspect records. Export/import sessions from Session Management.

Session databases are separate. Existing sessions receive additive schema updates on first load. Warning corrections recalculate the affected cycle; served penalties stay served and can be flagged for review. Deleted incidents remain in audit/export data.

## Stop, restart and update

Stop the app while retaining its race data:

```bash
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.prod.yml down
```

Start it again:

```bash
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.prod.yml up -d
```

To install a newer version, back up event data first. Also copy `backend/.env` to a safe location outside the repository before pulling: older versions tracked that file, while this version uses an untracked local file. Then run:

```bash
cp backend/.env ../racelith-env-backup.env
git pull --ff-only
cp -n ../racelith-env-backup.env backend/.env
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

The rebuild is needed after code or frontend configuration changes. PostgreSQL data lives in a named Docker volume and survives normal container rebuilds and `down`. **Do not add `-v` to `down` when you want to keep race data.**

A full database backup while the database container is running:

```bash
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T db sh -c 'pg_dumpall -U "$POSTGRES_USER"' > ../racelith-backup.sql
```

This writes a backup outside the repository containing the control database and all race databases. Copy it to a safe location. Restore procedures should be verified on a disposable instance before using an event backup.

## Use another computer or phone on the same network

Keep the app running on the host computer. Add that computer's browser URL to `CORS_ORIGINS` in `backend/.env`. For example, if its LAN address is `192.168.1.20`:

```dotenv
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.20:3000
```

Apply the configuration with the build/start command, then open `http://192.168.1.20:3000` on the other device. With the localhost API default, the frontend uses the host you opened and backend port 8000. Both ports must be reachable through the host firewall. LAN addresses can change, so use the host's current address.

For a public server, configure the browser-accessible API URL, matching CORS origins and HTTPS separately. The supplied Nginx configuration serves the frontend; it does not provide an HTTPS certificate or an API reverse proxy.

## Troubleshooting

View service logs:

```bash
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 backend frontend db
```

- **Cannot connect to the Docker daemon:** start Docker Desktop/the Docker service, then retry.
- **Environment file missing:** create `backend/.env` using the supplied template.
- **Port already allocated:** stop the application using that port. The default browser/API configuration expects ports 3000 and 8000.
- **Backend unhealthy or database connection failed:** check the database credentials and backend logs. Preserve the existing volume; recreating containers does not reset its credentials.
- **No active session:** create or load a session first.
- **Browser cannot reach the API:** check `http://localhost:8000/api/ready`, the API URL and CORS settings. On another device, use the host computer's address.
- **Production override fails to parse:** upgrade Compose to version 2.24.4 or newer.

## Optional: run the frontend and backend directly for development

Use **Python 3.12**, **Node.js 20+**, and PostgreSQL. The backend database user must be able to create and drop race databases. Docker-only users can skip this section.

To use Docker just for PostgreSQL, create `backend/.env` as above and run the base file, which publishes database port 5432:

```bash
docker compose --env-file backend/.env -f docker-compose.yml up -d db
```

In a terminal at the project root on macOS/Linux:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install pip==26.2.1
python -m pip install -r backend/requirements.lock
cd backend
DATABASE_URL=postgresql://racelith_user:YOUR_DATABASE_PASSWORD@127.0.0.1:5432/racelith_db python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Replace `YOUR_DATABASE_PASSWORD` with the password from `backend/.env`. Native Python connects to `127.0.0.1`; `db` is the hostname used inside Docker. If you changed the database username, name or port, use those values too.

In a second terminal at the project root:

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open [http://localhost:3000](http://localhost:3000). Use `npm ci` to install the pinned dependency graph even if the checkout already contains a `node_modules` folder.

For source checks and a frontend build:

```bash
npm run typecheck
npm run build
```

Use `Ctrl+C` in each terminal to stop the native frontend/API. Stop the database with:

```bash
docker compose --env-file backend/.env -f docker-compose.yml down
```

## Verification and scope

The non-authentication fixes passed **132 behavioral regression/E2E assertions**, plus frontend type checking and a production frontend build. Tests used real Chrome, FastAPI, Python 3.12 and disposable PostgreSQL 17 databases. Dependency scans reported zero known advisories in the tested pinned graphs.

See [the fix report](audit/FIX_REPORT.txt), [combined results](audit/fixed-results.json), and [the original audit](audit/AUDIT_REPORT.txt).

The Docker configuration was checked, but a complete container build/runtime was not executed because the Docker daemon was unavailable during verification. Compose uses PostgreSQL 15; its container runtime remains unverified. Authentication and operator authorization are deliberately deferred, so the application is not established as safe for unrestricted public access.

Regression scripts under `audit/` are for a disposable test instance only. They create sessions, mutate data, inject database failures and, in the fault suite, modify the test cluster's template database. Never run them against an event or shared PostgreSQL server.
