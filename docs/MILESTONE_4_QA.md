# Milestone 4 QA and Demo Record

## Status

**Automated integration passed on 2026-11-09.** Prisma generation, API/web type checking, 68 automated tests, and both production builds completed successfully. The real Windows/Docker/PostgreSQL workflow and responsive browser review remain pending local sign-off.

The release package also includes the post-integration date contract correction: machine, part, and maintenance-plan forms send strict `YYYY-MM-DD` values accepted by the API. The asset workspace test asserts the exact date-only request payload.

The scheduler advisory-lock query also returns a supported integer result instead of PostgreSQL's `void` result. This prevents Prisma `P2010` deserialization failures during startup and manual alert runs, with the SQL shape covered by an API regression assertion.

## Scope

Milestone 4 adds alert generation and lifecycle management to the Milestone 3 asset register. Maintenance-plan CRUD already exists and is a regression area, not a new Milestone 4 deliverable.

The scheduler evaluates:

- machine warranty end dates with a default 7-day threshold;
- part warranty end dates with a default 7-day threshold;
- part replacement due dates with a default 7-day threshold;
- active maintenance-plan due dates using each plan's `thresholdDays`.

It generates uniquely keyed alerts, reconciles stale alerts to `RESOLVED`, runs automatically at startup and daily, and supports an Admin/Manager manual run for demonstrations. Alert listing and acknowledgement are role-scoped.

## Endpoint Contract

| Method | Endpoint | Expected access |
|---|---|---|
| `GET` | `/api/alerts` | Admin/Owner/Manager all; Machine Operator assigned machines; Service Provider denied |
| `PATCH` | `/api/alerts/:alertId/acknowledge` | Same visibility scope as listing |
| `POST` | `/api/alerts/run-scheduler` | Admin and Manager only |

## Role Matrix

| Role | List alerts | Acknowledge | Manual scheduler run | Project Lead observation |
|---|---|---|---|---|
| Admin | All | All | Allow | Automated policy passed; local demo pending |
| Owner | All | All | Deny | Automated policy passed; local demo pending |
| Manager | All | All | Allow | Automated policy passed; local demo pending |
| Machine Operator | Assigned-machine alerts only | Assigned-machine alerts only | Deny | Automated scope passed; local demo pending |
| Service Provider | Deny | Deny | Deny | Automated denial passed; local demo pending |

## Delivered Behavior Checklist

| Item | Expected behavior | Project Lead observation |
|---|---|---|
| Machine warranty | Alert appears inside the default 7-day window | Automated test passed |
| Part warranty | Alert appears inside the default 7-day window | Automated test passed |
| Part replacement | Alert appears inside the default 7-day window | Automated test passed |
| Maintenance due | Active plan uses its configured `thresholdDays` | Automated test passed |
| Deduplication | Repeated/overlapping runs keep one alert per due event | Automated repeat-run and database-lock coverage passed |
| Reconciliation | Stale open/acknowledged alerts become resolved with `resolvedAt` | Automated test passed |
| Acknowledgement | Visible alert becomes acknowledged with `acknowledgedAt` | Automated API/UI tests passed |
| Startup run | API startup invokes one scheduler run | Code review passed; local restart pending |
| Daily run | One daily schedule is registered while the API is active | Timezone calculation test passed; long-running local check pending |
| Manual run | Admin/Manager can run; other roles are denied | Automated API/UI policy tests passed |
| Audit actions | All four required alert/scheduler actions are recorded | Automated service tests passed; local database review pending |
| Responsive UI | Alert states and controls remain usable at narrow widths | Component tests passed; visual browser review pending |

## Audit Acceptance

The following exact action names must be observed:

- `ALERT_GENERATED`
- `ALERT_RESOLVED`
- `ALERT_ACKNOWLEDGED`
- `ALERT_SCHEDULER_RUN`

Automatic scheduler runs may have a null actor. Manual runs and acknowledgements must identify the authenticated actor.

## Database Impact

No Prisma schema change or migration is required. The initial migration already contains the `Alert` model, `AlertType` and `AlertStatus` enums, source relationships, indexes, timestamps, and the unique `dedupeKey` constraint.

For an existing Milestone 3 database, run `npm run prisma:generate` but do not create an empty Milestone 4 migration.

## Automated Results

| Command | Expected | Observed result | Status |
|---|---|---|---|
| `npm run prisma:generate` | Prisma Client generation completes | Prisma Client 6.19.3 generated | Passed |
| `npm run typecheck` | API and web TypeScript checks complete | API and web completed without errors | Passed |
| `npm test` | API and web suites complete | 48 API + 20 web = 68 passed | Passed |
| `npm run build` | API and production web builds complete | API compiled; Vite built 1,676 modules | Passed |

Dependency security audit was not rerun during this integration pass. The Milestone 3 record documents the remaining Prisma tooling advisory whose published fix requires a breaking Prisma 7 upgrade.

## Windows and Docker QA

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"

do {
    Start-Sleep -Seconds 5
    docker info *> $null
} until ($LASTEXITCODE -eq 0)

docker compose up db -d
docker compose ps
npm install
npm run prisma:generate
```

Start the API and keep the window open:

```powershell
npm run dev:api
```

Start the frontend in a second PowerShell window and keep it open:

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"
npm run dev:web
```

Manual checks:

- [ ] API health responds at `http://localhost:4000/api/health`.
- [ ] One qualifying record for each of the four alert types produces an alert.
- [ ] A second unchanged scheduler run produces no duplicate.
- [ ] Acknowledgement records status, timestamp, and audit action.
- [ ] Moving a due date outside its window resolves the old alert.
- [ ] Clearing a source date resolves the old alert.
- [ ] Deactivating a maintenance plan resolves its active alert.
- [ ] A changed due date uses a new dedupe key when it becomes eligible.
- [ ] Admin and Manager can manually run the scheduler.
- [ ] Owner, Machine Operator, and Service Provider receive HTTP 403 for manual run.
- [ ] Machine Operator sees and acknowledges only assigned-machine alerts.
- [ ] Service Provider receives HTTP 403 for alert list and acknowledgement.
- [ ] Restarting the API runs reconciliation without creating duplicates.
- [ ] Browser console and API logs contain no unexpected errors.
- [ ] Desktop and narrow mobile layouts have no overlap or clipping.

## Regression Checklist

- [ ] Milestone 3 machine, part, and maintenance-plan CRUD still works.
- [ ] Milestone 3 asset RBAC remains unchanged.
- [ ] Operator deactivation/role change still clears assignments atomically.
- [ ] Authentication and inactive-session controls still work.
- [ ] User Management remains Admin-only.
- [ ] Existing audit events remain intact.
- [ ] No new Prisma migration was created for Milestone 4.

## Sign-off

| Reviewer | Result | Date | Notes |
|---|---|---|---|
| Project Lead | Automated pass | 2026-11-09 | 68 tests and production builds passed; Windows/Docker manual sign-off pending |
