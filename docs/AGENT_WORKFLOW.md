# Agent Workflow

Use this workflow when asking Codex to continue the Maintenance Report System.

## Milestone Flow

1. Project Lead reads the milestone, confirms scope, and assigns non-overlapping file areas.
2. Database/API Agent implements validation, business rules, routes, audit events, scheduler lifecycle, and backend tests.
3. Frontend Agent implements API services, alert screens, loading/empty/error states, responsive behavior, and frontend tests.
4. QA Agent reviews RBAC, time-boundary behavior, deduplication, reconciliation, and regressions, then runs the integrated verification commands.
5. Docs/Demo Agent updates `README.md` and `docs/**` without claiming unobserved test results.
6. Project Lead resolves findings, records observed results, reviews the diff, and creates the local commit.

## Milestone 4 Ownership

| Agent | Milestone 4 responsibility |
|---|---|
| Database/API | Alert service/routes, four due-date evaluators, unique-key handling, reconciliation, acknowledgement, startup/daily scheduling, audit events, API tests |
| Frontend | Role-scoped alert list, status display, acknowledgement, Admin/Manager manual-run control, responsive states, UI tests |
| QA | Clock-boundary tests, repeated/concurrent run checks, stale resolution, endpoint RBAC, startup/daily lifecycle, Milestone 3 regression verification |
| Docs/Demo | Exact endpoint contract, role matrix, Windows/Docker demo, migration note, pending QA record |
| Project Lead | Integration decisions, final verification, observed result recording, local commit/push |

Maintenance-plan CRUD belongs to the Milestone 3 baseline. Milestone 4 must reuse it and must not rebuild or describe it as a new database feature.

## Integration Contract

The API/frontend contract is:

- `GET /api/alerts`
- `PATCH /api/alerts/:alertId/acknowledge`
- `POST /api/alerts/run-scheduler` for Admin and Manager

The scheduler service is shared by startup, daily, and manual triggers. It evaluates machine warranty, part warranty, and part replacement with a 7-day default threshold; maintenance plans use their own `thresholdDays`.

Every run must be idempotent through `Alert.dedupeKey` and must reconcile stale alerts. Required audit actions are `ALERT_GENERATED`, `ALERT_RESOLVED`, `ALERT_ACKNOWLEDGED`, and `ALERT_SCHEDULER_RUN`.

## Verification Handoff

The Docs/Demo Agent leaves all Milestone 4 observed results as `Pending - Project Lead`. Only the person who runs the integrated commands records pass/fail counts.

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

The Project Lead also completes the Windows/Docker checklist in `docs/MILESTONE_4_QA.md`. No Prisma migration is expected because the initial schema already contains the Alert model, enums, relationships, indexes, and unique dedupe key.

## Review Gates

- Scheduler date tests use a controlled clock and consistent date boundaries.
- Repeated and overlapping runs cannot create duplicate alerts.
- Reconciliation resolves stale open and acknowledged alerts.
- Operator alert queries are scoped by assigned machine in the backend.
- Service Provider access is denied until approved work-order scope is implemented.
- Manual scheduler execution is restricted to Admin and Manager.
- Automatic startup and daily runs do not register duplicate timers.
- Audit details distinguish automatic and manual scheduler execution.
- Milestone 3 asset behavior remains unchanged.

## Local Desktop Remote

The project uses a local bare Git repository instead of a hosted remote.

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

git remote set-url origin "C:\Users\Malith pamuditha\Desktop\maintenance-report-system-local-remote.git"
git status
git diff --check
git add -A
git commit -m "feat: add alert scheduler and acknowledgement"
git push origin main
```

The Project Lead must inspect the diff and verification results before committing. Use a normal current-time commit; do not backdate or fabricate Git history.
