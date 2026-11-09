# Maintenance Request Reporting System

Role-based maintenance management prototype for the Department of Instrumentation and Automation Technology, Faculty of Technology, University of Colombo.

Milestone 4 adds in-app deadline alerts and scheduler operations on top of the Milestone 3 asset register. Maintenance-plan CRUD already exists. The new scheduler evaluates machine warranties, part warranties, part replacement dates, and maintenance-plan due dates, then reconciles generated alerts without creating duplicates.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| API Docs | Swagger/OpenAPI baseline |
| Logging | Pino and database audit records |
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

## Milestone 4 Scope

1. The scheduler evaluates machine warranty end dates using a default 7-day warning window.
2. It evaluates part warranty end dates using a default 7-day warning window.
3. It evaluates part replacement due dates using a default 7-day warning window.
4. It evaluates active maintenance plans using each plan's `thresholdDays` value and `nextDueDate`.
5. Each due event receives a deterministic `dedupeKey`. The database unique constraint makes repeated scheduler runs idempotent and prevents duplicate alerts.
6. Every run reconciles existing alerts. Alerts that still represent an active due condition remain active; stale `OPEN` or `ACKNOWLEDGED` alerts are changed to `RESOLVED` with `resolvedAt` recorded.
7. When a source date changes, the old due event is resolved during reconciliation and the new due event can receive its own dedupe key when it enters its warning window.
8. The scheduler runs automatically at API startup and once per day while the API process is running. The defaults are 01:00 in `Asia/Colombo`, configurable through `ALERT_SCHEDULER_HOUR` and `ALERT_SCHEDULER_TIMEZONE`.
9. Admin and Manager can trigger a manual scheduler run for demonstrations and operational recovery.
10. Authorized users can list role-scoped alerts and acknowledge visible alerts.

Milestone 4 uses in-app alerts only. Email, SMS, WhatsApp, and other external messaging remain outside the prototype scope.

## Alert API Contract

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| `GET` | `/api/alerts` | List alerts within the authenticated user's role scope | Admin, Owner, Manager, Machine Operator |
| `PATCH` | `/api/alerts/:alertId/acknowledge` | Acknowledge an alert visible to the authenticated user | Admin, Owner, Manager, assigned Machine Operator |
| `POST` | `/api/alerts/run-scheduler` | Run generation and reconciliation immediately | Admin, Manager |

Service Provider accounts do not receive Milestone 4 asset alerts. Their future visibility is limited to approved work orders in Milestone 5.

`GET /api/alerts` accepts optional `status` and `type` query filters. Each defaults to `ALL`. The response contains the role-scoped `alerts` collection plus `open`, `acknowledged`, `overdue`, and `dueSoon` summary counts. Acknowledgement returns `{ alert }`; acknowledging an already acknowledged alert is idempotent, while a resolved alert returns HTTP 409. A manual run returns `{ result }` with `created`, `existing`, `resolved`, and `evaluatedAt`.

## Alert Role Matrix

| Role | List alerts | Acknowledge | Manual scheduler run |
|---|---|---|---|
| Admin | All alerts | Any visible alert | Allow |
| Owner | All alerts | Any visible alert | Deny |
| Manager | All alerts | Any visible alert | Allow |
| Machine Operator | Alerts for assigned machines only | Assigned-machine alerts only | Deny |
| Service Provider | Deny | Deny | Deny |

Backend authorization is the security boundary. Hiding a control in the frontend does not replace the API permission check.

## Alert Lifecycle and Audit

Alert states are `OPEN`, `ACKNOWLEDGED`, and `RESOLVED`.

- A generated alert starts as `OPEN`.
- Acknowledgement changes a visible alert to `ACKNOWLEDGED` and records `acknowledgedAt`.
- Scheduler reconciliation changes an alert to `RESOLVED` and records `resolvedAt` when its source no longer qualifies.
- The unique `dedupeKey` prevents more than one alert for the same source, alert type, and due event.

Milestone 4 records these audit actions:

- `ALERT_GENERATED`
- `ALERT_RESOLVED`
- `ALERT_ACKNOWLEDGED`
- `ALERT_SCHEDULER_RUN`

Automatic runs are system actions and may have no user actor. A manual scheduler run records the authenticated Admin or Manager as the actor.

## Windows PowerShell Setup

Docker Desktop must be open and its Linux container engine must be running.

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

Copy-Item .env.example .env -Force
Copy-Item .env apps/api/.env -Force

npm install
npm run prisma:generate
docker compose up db -d
```

For a fresh checkout with an empty database, apply the migration history already committed to the project:

```powershell
npm run prisma:migrate
```

Milestone 4 does **not** add a Prisma schema change or migration. The `Alert` model, `AlertType` and `AlertStatus` enums, alert relationships, and unique `dedupeKey` index were already included in the initial schema.

Optional demo administrator seed:

```powershell
npm run seed --workspace apps/api
```

Seeded credentials:

```text
Email: admin@example.com
Password: Admin@12345
```

The seed is for local demonstration only. Change or remove the demo account before any shared deployment.

## Run Locally

Start the API and leave the PowerShell window open:

```powershell
npm run dev:api
```

In a second PowerShell window:

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"
npm run dev:web
```

Open:

- Frontend: <http://localhost:5173>
- API health: <http://localhost:4000/api/health>
- Swagger UI: <http://localhost:4000/api/docs>

## Milestone 4 Demo Script

1. Sign in as Admin and confirm the machine, part, and maintenance plan created in Milestone 3 are available.
2. Set one machine warranty, part warranty, or part replacement date within 7 days.
3. Set an active maintenance plan's next due date inside its configured `thresholdDays` window.
4. Trigger `POST /api/alerts/run-scheduler` as Admin or Manager.
5. Confirm one alert is created for each qualifying due event.
6. Run the scheduler again and confirm the alert count does not increase for unchanged due events.
7. Acknowledge an alert and confirm its state and timestamp change.
8. Move a source date outside its threshold or deactivate the maintenance plan, run the scheduler, and confirm the stale alert is resolved.
9. Sign in as the assigned Machine Operator and confirm only alerts for assigned machines are visible and acknowledgeable.
10. Confirm Owner can list and acknowledge alerts but cannot manually run the scheduler.
11. Confirm Service Provider cannot access the alert endpoints.
12. Restart the API and verify the startup scheduler runs without duplicating existing alerts.

## Verification Commands

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

Milestone 4 automated integration verification passed on 2026-11-09: Prisma generation, API/web type checking, 68 automated tests, and both production builds completed successfully. The real Windows/Docker/PostgreSQL demo and responsive browser checks remain for local sign-off in `docs/MILESTONE_4_QA.md`.

## Local Commit and Desktop Bare Remote

Keep the project local by using the bare repository on the Desktop as `origin`:

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

git remote set-url origin "C:\Users\Malith pamuditha\Desktop\maintenance-report-system-local-remote.git"
git add -A
git commit -m "feat: add alert scheduler and acknowledgement"
git push origin main
```

This push remains on the Windows computer and does not publish the project to GitHub. Use the current date and time for commits; do not fabricate or backdate Git history.

## Milestone Status

- Milestone 1: monorepo, API/web foundations, Prisma schema, and Docker configuration.
- Milestone 2: authentication, first-admin setup, user administration, sessions, RBAC, and audit foundations.
- Milestone 3: machine, part, maintenance-plan, assignment, asset RBAC, audit, tests, and demo documentation.
- Milestone 4: alert scheduler, deduplication, reconciliation, role-scoped listing, acknowledgement, scheduler audit events, responsive alert UI, and automated integration verification complete; Windows/Docker demo sign-off pending.
