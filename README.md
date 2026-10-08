# Maintenance Request Reporting System

Role-based maintenance management prototype for the Department of Instrumentation and Automation Technology, Faculty of Technology, University of Colombo.

The system keeps one dependable record for machinery, machine parts, warranty periods, maintenance cycles, alerts, service provider work orders, service evidence, and daily/monthly reports.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| API Docs | Swagger/OpenAPI |
| Logging | Pino |
| Testing | Vitest, Supertest, React Testing Library |
| Local Run | Docker Compose |

## Project Structure

```text
maintenance-report-system/
  apps/
    api/
      prisma/
      src/
    web/
      src/
  docs/
  docker-compose.yml
  AGENTS.md
  README.md
```

## First-Time Setup on Windows

From PowerShell:

```powershell
cd "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"
copy .env.example .env
npm install
npm run prisma:generate
```

Start PostgreSQL only:

```powershell
docker compose up db -d
```

Create the database tables:

```powershell
npm run prisma:migrate
```

Run the API and frontend:

```powershell
npm run dev:api
npm run dev:web
```

Open:

- Frontend: <http://localhost:5173>
- API health: <http://localhost:4000/api/health>
- Swagger docs: <http://localhost:4000/api/docs>

## Docker Full Stack

```powershell
copy .env.example .env
docker compose up --build
```

In another terminal, run the migration against the Docker database:

```powershell
npm run prisma:migrate
```

## Useful Commands

```powershell
npm run typecheck
npm test
npm run build
npm run docker:down
```

## MVP Roles

| Role | Main Purpose |
|---|---|
| Admin | Creates users, assigns roles, views audit logs |
| Owner | Views assets, approvals, costs, evidence, reports |
| Manager | Monitors operations and verifies completion |
| Machine Operator | Maintains assigned machines, parts, dates, and approvals |
| Service Provider | Views approved work orders and submits completion evidence |

## Milestone Status

Milestone 1 creates the foundation: monorepo, API shell, web shell, Prisma schema, Docker Compose, project instructions, and setup documentation.

Next milestone: authentication, first admin setup, password hashing, role-based access control, and role dashboards.
