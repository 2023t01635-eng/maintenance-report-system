# Maintenance Report System Agent Guide

## Project Goal

Build a focused university prototype for a Maintenance Request Reporting System.
The system must use:

- PostgreSQL RDBMS
- Express REST API
- React SPA frontend
- Authentication with password hashing
- Role-based access control
- CRUD for core maintenance entities
- Daily and monthly CSV/PDF reports
- Logging, audit trail, Swagger/OpenAPI, tests, and README documentation

## Agent Team

Use subagents when work can be separated cleanly. Keep write-heavy work coordinated through the main agent.

| Agent | Responsibility |
|---|---|
| Project Lead | Owns scope, milestone order, decisions, and final integration |
| Database/API Agent | Prisma schema, migrations, Express routes, validation, RBAC, scheduler |
| Frontend Agent | React SPA, dashboards, forms, client validation, responsive UI |
| QA Agent | Automated tests, manual demo checklist, bug reproduction, regression checks |
| Docs/Demo Agent | README, Swagger, architecture docs, presentation and Q&A support |

## Working Rules

- Keep the MVP focused. WhatsApp, SMS, IoT, mobile app, predictive analytics, and payment gateways are future scope.
- Prefer TypeScript and explicit validation over loose JavaScript objects.
- Use Prisma for database access. Avoid raw SQL unless a report query clearly needs it.
- Backend permissions are the real security layer. Frontend hiding is only a convenience.
- Passwords must be hashed. Never store plain text passwords.
- Use clear local Git commits after each meaningful milestone.
- Do not fabricate Git history or false dates.
- Run tests or type checks before closing a milestone.

## Verification Commands

From the repository root:

```powershell
npm install
npm run typecheck
npm test
npm run build
docker compose up --build
```

Backend:

```powershell
npm run dev:api
```

Frontend:

```powershell
npm run dev:web
```

Prisma:

```powershell
npm run prisma:generate
npm run prisma:migrate
```

## Milestone 1 Acceptance

- Root monorepo exists.
- API app has health route and Swagger route.
- Web app has a dashboard shell and API health check.
- Prisma schema exists for the planned domain.
- Docker Compose can start PostgreSQL, API, and web services.
- README explains local setup clearly.
