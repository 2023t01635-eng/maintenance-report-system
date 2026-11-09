# Test Plan

## Verification Status

Milestone 5 automated integration passed on 2026-11-10:

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

Prisma schema validation passed. The integrated result was 66 API tests and 32 web tests, for 98 passing tests. Windows/Docker/PostgreSQL and responsive browser checks remain manual acceptance items in `docs/MILESTONE_5_QA.md`.

## Work Order API Coverage

| Area | Automated checks |
|---|---|
| Authentication | Anonymous list is rejected |
| Management | Create, edit, submit, dispatch, and cancel role rules |
| Operator scope | Assigned-machine approval succeeds; unrelated operator is denied |
| Provider visibility | Only assigned, approved-or-later work is returned |
| Provider progress | Start and complete require assigned provider and valid current state |
| Service details | Completion date, cost, replaced parts, and notes are provider-only |
| Evidence | Provider-only append, work-order link, uploader, and safe URL validation |
| Transitions | Invalid or repeated transitions return a conflict response |
| Audit | Every successful mutation writes its required action |
| Regression | Existing auth, users, assets, alerts, and scheduler tests remain green |

## Frontend Coverage

| Area | Automated checks |
|---|---|
| Navigation | Work Orders is available to management, operators, and providers |
| List states | Loading, error, empty, search, and status filtering |
| Management | Create/edit, submit, provider selection, dispatch, and cancellation controls |
| Operator | Approval appears only for eligible pending work |
| Provider | Start, service details, evidence, and complete actions |
| Contract | Dispatch sends the selected provider ID |
| Evidence review | Stored metadata is visible in order details |
| Responsive structure | Stable list/detail controls and wrapping classes are rendered |

## Manual Windows and Docker QA

1. Open Docker Desktop and wait for the Linux engine.
2. Stop Node processes to release Prisma's Windows DLL.
3. Extract the Milestone 5 archive over the project.
4. Run `docker compose up db -d`, `npm run prisma:generate`, and `npm run prisma:migrate`.
5. Start API and web processes in separate PowerShell windows.
6. Create active Operator and Provider accounts and assign the operator to a machine.
7. Execute the complete draft-to-completed demo flow with separate role sessions.
8. Confirm unassigned operators and providers receive backend denial.
9. Verify cost, completed date, replaced parts, notes, and evidence persist after refresh.
10. Check desktop and narrow mobile widths for clipping, overlap, and unusable controls.
11. Check API logs, browser console, and audit records for unexpected errors.

## Regression Areas

- Login, logout, inactive-session rejection, and first-admin setup.
- Admin-only user management.
- Machine, part, maintenance-plan, and assignment behavior.
- Alert generation, acknowledgement, role scope, and reconciliation.
- Provider denial for asset and alert endpoints.
- Operator asset and alert scope remains assigned-machine only.

## Later Milestones

| Area | Planned tests |
|---|---|
| Reports | Daily/monthly filters, summaries, and exports |
| Documents | Work-order document rendering and download behavior |
| File storage | Binary upload limits, MIME validation, retention, and deletion |
