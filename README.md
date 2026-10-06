# Racelith Penalty Tracking System

An app for managing karting sessions, infringements, warnings, penalties and audit history, with live dashboard updates.

## Run the application

The original `backend/.env` is included and already configured. **No environment-file setup or editing is required for the supplied Docker setup.**

1. Install and open Docker Desktop (or start Docker Engine on Linux).
2. Open a terminal in this project folder, where `docker-compose.yml` is located.
3. Build and start the application with one command:

   ```bash
   docker compose up --build -d
   ```

4. Open **[http://localhost:3000](http://localhost:3000)** in your browser.

The first build takes longer because Docker downloads dependencies. Allow the services time to become healthy after starting. Create a session with **New Session**, or load an existing session, before logging infringements.

If you prefer to build and start separately, the equivalent commands are:

```bash
docker compose build
docker compose up -d
```

### Do I need to make a separate Docker image?

No. Compose builds the frontend and backend images from the Dockerfiles already in the repository and downloads the PostgreSQL image. It then runs all three containers. You do not need to upload anything to Docker Hub or install Python, Node.js or PostgreSQL separately.

Use **`docker compose build`**, rather than `docker build`, to build the whole application. `docker build` builds one image and does not start containers. [Docker documents the build-and-start option here](https://docs.docker.com/reference/cli/docker/compose/up/).

The browser uses port **3000** and the API uses port **8000**. PostgreSQL stays inside Docker and does not occupy a host port.

## Stop and start again

Stop the application:

```bash
docker compose down
```

Start it again without rebuilding:

```bash
docker compose up -d
```

Race data is stored in a Docker volume and survives a normal stop, restart or image rebuild. **Do not use `docker compose down -v` if you want to keep race data.**

## Get an update

From the project folder:

```bash
git pull --ff-only
docker compose build
docker compose up -d
```

Back up event data before updating an installation that contains real race records. Keep the same project folder so Compose continues using the same database volume.

If you pulled the temporary documentation commit that removed `backend/.env`, pulling the current version restores the original file. Existing custom installations should retain the database credentials their current volume uses.

## Check whether it is running

```bash
docker compose ps
```

The services are `db`, `backend` and `frontend`. View their logs with:

```bash
docker compose logs --tail=100 backend frontend db
```

- **Docker daemon unavailable:** open Docker Desktop/start the Docker service, then retry.
- **Port already allocated:** close the application using port 3000 or 8000, then retry.
- **Services still starting:** wait for health checks to become healthy and inspect the logs above if they fail.
- **No active session:** create or load a session in the app.

Additional URLs:

- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Database readiness: [http://localhost:8000/api/ready](http://localhost:8000/api/ready)

## Use another device on the same network

Keep the app running on the host computer and open `http://HOST_COMPUTER_IP:3000` on the other device. For example: `http://192.168.1.20:3000`. The frontend uses that host's API on port 8000. Both ports must be reachable through the host firewall. Only the host needs Docker; other devices use a browser.

## Optional deployment override

The normal two-command startup above is sufficient for the supplied setup. For the extra logging and backup mount configuration, use Docker Compose **2.24.4 or newer** and run:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

For a public server, configure HTTPS, a browser-accessible API URL and access controls separately. The supplied Nginx configuration serves the frontend; it does not provide an HTTPS certificate or an API reverse proxy.

## Verification and scope

The non-authentication fixes passed **132 behavioral regression/E2E assertions**, frontend type checking and a production frontend build. Tests used real Chrome, FastAPI, Python 3.12 and disposable PostgreSQL 17 databases. Dependency scans reported zero known advisories in the tested pinned graphs.

See [the fix report](audit/FIX_REPORT.txt), [combined results](audit/fixed-results.json), and [the original audit](audit/AUDIT_REPORT.txt).

The simplified Docker setup was checked using the included environment file, including matching database credentials and internal-only database networking. A complete container build/runtime remains unverified because Docker was not running during verification. The Compose database image uses PostgreSQL 15. Authentication and operator authorization remain deferred.

The original environment file is deliberately included for the client's preconfigured setup. The optional `backend/.env.example` remains available for developers. For native development, use Python 3.12 with `backend/requirements.lock`, Node.js 20+, and `npm ci` in `frontend`.

Regression scripts under `audit/` are for disposable test instances only. They mutate data and inject database failures; the fault suite also modifies the test cluster's template database. Never run them against an event or shared PostgreSQL server.
