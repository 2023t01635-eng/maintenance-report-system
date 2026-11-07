# Maintenance Request Reporting System

Role-based maintenance management prototype for the Department of Instrumentation and Automation Technology, Faculty of Technology, University of Colombo.

Milestone 3 adds the asset register: machine records, machine parts, preventive maintenance plans, operator assignment, role-based controls, and audit events.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| API Docs | Swagger/OpenAPI baseline |
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

## Milestone 3 Workflow

1. An Admin, Owner, or Manager creates a machine with its asset code, category, location, status, manufacturer details, warranty dates, and optional Machine Operator assignment.
2. Authorized users add parts to that machine, including part number, quantity, warranty dates, and replacement due date.
3. Authorized users add preventive maintenance plans with a frequency, next due date, alert threshold, and optional custom interval.
4. A Machine Operator can open only machines assigned to that account and can read their machine, part, and maintenance-plan details.
5. Asset changes create audit records identifying the actor, action, entity, and affected record.
6. If an assigned operator is deactivated or changed to another role, all machine assignments for that user are cleared atomically as part of the user update.

Machine status values are `ACTIVE`, `INACTIVE`, `UNDER_MAINTENANCE`, and `RETIRED`. Maintenance frequency values are `DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`, `YEARLY`, and `CUSTOM`.

## Asset Register RBAC

| Role | Read machines | Create/update machines | Delete machines | Create/update parts and plans | Delete parts and plans |
|---|---|---|---|---|---|
| Admin | All | Yes | Yes | Yes | Yes |
| Owner | All | Yes | No | Yes | No |
| Manager | All | Yes | No | Yes | Yes |
| Machine Operator | Assigned records only | No | No | No | No |
| Service Provider | No asset-register access | No | No | No | No |

The Machine Operator permission is read-only. Service Provider access begins with approved work orders in a later milestone; it does not include the Milestone 3 asset register.

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

For a fresh checkout with an empty database, apply the migrations already committed to the project:

```powershell
npm run prisma:migrate
```

Milestone 3 does **not** add a Prisma migration. If the Milestone 2 database is already initialized, do not create another migration for this milestone.

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

Start the API:

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
- Swagger UI (health endpoint baseline): <http://localhost:4000/api/docs>

## Demo Script

1. Sign in as Admin and open the Assets workspace.
2. Create an active Machine Operator from User Management.
3. Create a machine and assign the operator.
4. Add one part with quantity, warranty end, and replacement due dates.
5. Add one monthly maintenance plan with a next due date and threshold.
6. Edit the machine status and maintenance plan to demonstrate update auditing.
7. Sign in as the operator and confirm that only the assigned machine is visible and no edit/delete controls are available.
8. Sign in as Owner and confirm that create/update controls are available while all delete controls are absent.
9. Sign in as Manager and confirm that parts/plans can be deleted but the machine cannot.
10. Sign in as Service Provider and confirm that the asset register is unavailable.
11. As Admin, deactivate the operator or change the role, then confirm the machine assignment is cleared.

## Verification Commands

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

The Project Lead records observed Milestone 3 results in `docs/MILESTONE_3_QA.md` after running these commands on the integrated branch.

## Local Commit and Desktop Bare Remote

Keep the project local by using the bare repository on the Desktop as `origin`:

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

git remote -v
git remote set-url origin "C:\Users\Malith pamuditha\Desktop\maintenance-report-system-local-remote.git"

git add -A
git commit -m "feat: add machine and maintenance management"
git push origin main
```

This push remains on the Windows computer and does not publish the project to GitHub.

## Milestone Status

- Milestone 1: monorepo, API/web foundations, Prisma schema, and Docker configuration.
- Milestone 2: authentication, first-admin setup, user administration, sessions, RBAC, and audit foundations.
- Milestone 3: machine, part, maintenance-plan, assignment, asset RBAC, audit, tests, and demo documentation.
