# Test Plan

## Verification Status

Milestone 4 automated integration passed on 2026-11-09. The following commands completed successfully from the repository root:

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

The integrated result was 48 API tests and 20 web tests, for 68 passing tests. The Windows/Docker/PostgreSQL and responsive browser checks remain manual acceptance items in `docs/MILESTONE_4_QA.md`.

## Scheduler Coverage

| Area | Required automated checks |
|---|---|
| Machine warranty | Creates `MACHINE_WARRANTY` at the default 7-day threshold and skips absent/out-of-window dates |
| Part warranty | Creates `PART_WARRANTY` at the default 7-day threshold |
| Part replacement | Creates `PART_REPLACEMENT` at the default 7-day threshold |
| Maintenance due | Uses each active plan's `thresholdDays`; skips inactive plans |
| Overdue records | Remain eligible until source data is reconciled out of scope |
| Deduplication | Repeated runs keep one alert for an unchanged due event |
| Concurrency | Database unique `dedupeKey` prevents duplicates during overlapping runs |
| Date change | Resolves the previous event and creates a new key only when the new event qualifies |
| Reconciliation | Resolves stale `OPEN` and `ACKNOWLEDGED` alerts and records `resolvedAt` |
| Audit | Writes generation, resolution, and scheduler-run audit actions |
| Automatic run | Startup hook calls the scheduler and daily scheduling is registered once |

Use a controlled clock or injected date in scheduler tests. Date comparisons must not depend on the developer computer's local time.

## API Coverage

| Endpoint/area | Required automated checks |
|---|---|
| `GET /api/alerts` | Anonymous returns 401; Service Provider returns 403 |
| Alert listing | Admin/Owner/Manager receive all alerts |
| Operator listing | Machine Operator receives only alerts for assigned machines |
| Acknowledge | Visible `OPEN` alert becomes `ACKNOWLEDGED` with `acknowledgedAt` |
| Acknowledge scope | Operator cannot acknowledge another machine's alert; provider is denied |
| Acknowledge audit | Successful acknowledgement writes `ALERT_ACKNOWLEDGED` |
| Manual scheduler | Admin and Manager succeed; Owner, Operator, and Provider receive 403 |
| Manual run audit | Records `ALERT_SCHEDULER_RUN` with the authenticated actor |
| Route validation | Invalid/missing alert IDs and nonexistent alerts return the defined client response |

## Frontend Coverage

| Area | Required automated checks |
|---|---|
| Alert list | Loading, populated, empty, and API-error states |
| Role scope | Operator UI renders only API-provided assigned-machine alerts |
| Acknowledgement | Allowed role can acknowledge and the list refreshes or updates safely |
| Manual run control | Visible to Admin/Manager only and calls `/api/alerts/run-scheduler` |
| Denied roles | Owner, Operator, and Provider do not see the manual-run control |
| Status rendering | `OPEN`, `ACKNOWLEDGED`, and `RESOLVED` are distinguishable and readable |
| Responsive layout | Alert controls and status content do not clip or overlap on narrow screens |

## Alert Role Matrix

| Role | List scope | Acknowledge scope | Manual run |
|---|---|---|---|
| Admin | All alerts | All alerts | Allow |
| Owner | All alerts | All alerts | Deny |
| Manager | All alerts | All alerts | Allow |
| Machine Operator | Assigned-machine alerts | Assigned-machine alerts | Deny |
| Service Provider | Deny | Deny | Deny |

## Manual Windows and Docker QA

1. Open Docker Desktop and wait until the Linux container engine is running.
2. In PowerShell, change to `C:\Users\Malith pamuditha\Desktop\maintenance-report-system`.
3. Run `docker compose up db -d` and confirm the database is healthy with `docker compose ps`.
4. Run `npm run prisma:generate`. Do not create a Milestone 4 migration.
5. Start the API with `npm run dev:api` and keep that PowerShell window open.
6. Start the web app with `npm run dev:web` in a second PowerShell window and keep it open.
7. Sign in as Admin and prepare one source date inside each required warning window.
8. Run the scheduler manually and verify four alert types can be generated.
9. Run it again without changing data and verify the alert count remains unchanged.
10. Acknowledge an alert and verify status, timestamp, and audit action.
11. Move one source date outside its threshold or deactivate a plan, run the scheduler, and verify resolution.
12. Verify the complete role matrix with separate accounts, including direct API denial rather than UI hiding alone.
13. Restart the API and confirm the startup run does not duplicate alerts.
14. Keep the API running long enough in a controlled test or use the scheduler abstraction to confirm only one daily timer is registered.
15. Check browser console, API logs, and audit records for unexpected errors.
16. Check desktop and narrow mobile widths for clipping, overlap, and usable controls.

Useful local checks:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
docker compose ps
```

## Regression Areas

- Login/logout, inactive-session rejection, and first-admin setup still work.
- User Management remains Admin-only.
- Machine, part, and maintenance-plan CRUD retain Milestone 3 permissions.
- Machine Operator asset and alert reads remain limited to assigned machines.
- Service Provider cannot access the asset register or Milestone 4 alerts.
- Assignment cleanup still occurs when an operator is deactivated or changes role.
- Existing asset mutation audit records remain intact.
- The initial migration remains the complete schema migration; Milestone 4 adds no migration.

## Later Milestones

| Area | Planned tests |
|---|---|
| Work orders | Approval transitions and provider visibility |
| Evidence | File metadata, role restrictions, and work-order linkage |
| Reports | Daily/monthly filters and export checks |
