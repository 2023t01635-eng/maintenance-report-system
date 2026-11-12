# Test Plan

## Milestone 5.5 automated status

Observed on 2026-11-12 in the delivery workspace:

| Check | Result |
|---|---|
| Prisma Client generation | Passed |
| Prisma schema validation | Passed |
| API TypeScript check | Passed |
| Web TypeScript check | Passed |
| API test suite | 71 passed in 7 files |
| Web test suite | 29 passed in 4 files |
| API production build | Passed |
| Web production build | Passed, 1,678 modules transformed |

Total automated tests: **100 passed**.

The workspace has no Docker daemon, PostgreSQL server, or PowerShell runtime. The real database migration and live scenario remain target-Windows acceptance checks in `docs/MILESTONE_5_5_QA.md`.

## API coverage

| Area | Automated checks |
|---|---|
| Authentication and RBAC | Anonymous denial and role-specific route access |
| Operator assets | Own-machine auto-assignment, scoped reads/writes, part and plan permissions |
| Alerts | Scheduler, dedupe, role scope, acknowledgement, reopen, and payment-alert isolation |
| Request creation | Operator machine scope, source-alert validation, duplicate active request prevention |
| Management | Review, active-provider validation, dispatch, rejection, cancellation |
| Provider | Assigned-only visibility, acceptance before start, service data, evidence, replacements |
| Completion | Payment-alert creation and transition to payment review |
| Payment | Replacement date application, alert resolution, approver/reference, closure |
| Audit | Successful workflow mutations write actor-linked actions |
| Activity | Admin-all, Owner hierarchy, Manager hierarchy, and signed-in Operator/Provider-only audit feeds |
| Payment analytics | Management outflow, provider-only inflow, budget variance, replaced parts, approver, and operator denial |
| Receipt identity | Admin-only profile updates and provider service receipt fields persist |
| Financial workflow | Dispatch budget, provider service cost, editable part prices, calculated final total, counteroffer history, repeated revision/resubmission, and payment audit totals |
| Regression | Existing auth, user, asset, alert, scheduler, and health tests remain green |

## Frontend coverage

| Area | Automated checks |
|---|---|
| Alert-to-request | Alert callback preselects machine, source alert, title, and category |
| Machine context | Request editor loads machine identity, parts, dates, and plans |
| Operator assets | Create/edit controls for own machines, parts, and plans; destructive controls hidden |
| Management dispatch | Provider selection and approve-and-send contract |
| Provider workflow | Acceptance appears before start |
| Provider access | Assigned request opens without calling protected machine-part endpoints |
| Receipt editor | Provider invoice and identity fields are submitted and rendered |
| Cost summary | Proposed budget, parts total, service charge, final total, and variance render correctly |
| Overview | Provider receives a role-scoped recent-activity event |
| Payments | Role-visible navigation, provider inflow metrics, replaced parts, approver, and under-budget result |
| Payment review | Reference is sent and the closed state renders |
| Price negotiation | Owner/Manager counter form, provider message, part-price edit, and revised receipt resubmission |
| Existing UI | Authentication, navigation, alerts, and asset register regressions |

## Live Windows acceptance

1. Open Docker Desktop and wait for the Linux engine.
2. Stop Node processes to release Prisma's Windows DLL.
3. Extract the Milestone 5.5 archive over the project.
4. Run `docker compose up db -d`, Prisma generation, and migrations.
5. Start API and web processes in separate PowerShell windows.
6. Run `scripts/milestone-5-5-live-scenario.ps1`.
7. Confirm the script prints `MILESTONE 5.5 LIVE SCENARIO PASSED`.
8. Perform the human walkthrough in `docs/MILESTONE_5_5_USER_SCENARIO.md` at desktop and narrow mobile widths.
9. Inspect API logs, browser console, and audit rows for unexpected errors.

## Later coverage

Binary file upload, durable object storage, scheduled alert execution outside the process, and generated PDF documents remain future scope. This milestone stores evidence metadata and provides a browser-printable service slip.
