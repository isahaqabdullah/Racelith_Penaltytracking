Racelith Docker images required by the Electron wrapper:

- backend image: racelith-backend:latest saved to backend.tar
- frontend image: racelith-frontend:latest saved to frontend.tar
- Postgres image: postgres:15 saved to postgres.tar

Build and export images before packaging:

```
docker save racelith-backend:latest -o backend.tar
docker save racelith-frontend:latest -o frontend.tar
docker save postgres:15 -o postgres.tar
```
