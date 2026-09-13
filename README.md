# EkaVio development

EkaVio is a React/Vite PWA with an Express/TypeScript backend and MongoDB. V2-01 establishes deterministic install, lint, typecheck, test, build, health, and local-container foundations without changing business workflows.

## Prerequisites

- Node.js 20 or later
- npm
- Docker with the Compose plugin for the container workflow

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if execution policy blocks the `npm.ps1` shim.

## Local environment

Copy the example files before running the applications directly:

```powershell
Copy-Item backend/.env.sample backend/.env
Copy-Item frontend/.env.example frontend/.env
```

The committed examples contain development-only values. Replace all secrets for any shared or production environment. Backend startup validates `NODE_ENV`, `PORT`, `MONGO_URI`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `HTTP_ALLOWED_ORIGINS`, and `SOCKET_ALLOWED_ORIGINS`. Comma-separate multiple allowed origins.

The frontend requires `VITE_API_URL` (including `/api`) and `VITE_SOCKET_URL`. Vite embeds both values at build time.

## Install dependencies

```powershell
Set-Location backend
npm.cmd ci
Set-Location ../frontend
npm.cmd ci
Set-Location ..
```

## Development servers

Start the backend and frontend in separate terminals:

```powershell
Set-Location backend
npm.cmd run dev
```

```powershell
Set-Location frontend
npm.cmd run dev
```

The examples use `http://localhost:5000` for the backend and `http://localhost:5173` for Vite.

## Quality gates

Backend:

```powershell
Set-Location backend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd start
```

Frontend:

```powershell
Set-Location frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

`npm start` in the backend runs compiled `dist/server.js`; run `npm run build` first.

## Docker Compose

From the repository root:

```powershell
docker compose config
docker compose up --build
```

Compose uses a pinned MongoDB image, local-only default credentials, a named data volume, and dependency health checks. MongoDB is not published to the host. Override the development defaults with environment variables before using the stack outside a local workstation.

## Health endpoints

- `GET http://localhost:5000/health/live` returns HTTP 200 whenever the API process can respond. It does not depend on MongoDB.
- `GET http://localhost:5000/health/ready` returns HTTP 200 only while Mongoose reports an active MongoDB connection; otherwise it returns HTTP 503.

Health responses expose only status labels and never connection strings or secrets.
