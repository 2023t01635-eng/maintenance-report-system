# Agent Workflow

Use this workflow when asking Codex to continue the Maintenance Report System.

## Team flow

1. Project Lead reads the handoff, confirms scope, and assigns non-overlapping areas.
2. Database/API Agent implements schema, migrations, validation, authorization, transactions, audit, and API tests.
3. Frontend Agent implements contracts, role-aware workflows, responsive states, printing, and component tests.
4. QA Agent checks role isolation, transition validity, negative paths, migrations, and regressions.
5. Docs/Demo Agent updates observed results, Windows steps, and the executable user scenario.
6. Project Lead integrates, verifies, packages source, and leaves Git unchanged unless the user requests a commit.

## Milestone 5.5 integration contract

`DRAFT -> PENDING_MANAGEMENT_APPROVAL -> SENT_TO_PROVIDER -> PROVIDER_ACCEPTED -> IN_PROGRESS -> AWAITING_PAYMENT_APPROVAL -> CLOSED`

- The operator creates and submits a request for their own machine; no duplicate operator approval is required.
- Admin, Owner, or Manager selects an active provider and dispatches.
- Only the selected provider can accept, start, edit service data, add replacements/evidence, and submit completion.
- Completion creates a payment alert for management.
- Admin, Owner, or Manager approves payment; part dates are then applied and the request closes.
- `REJECTED`, `CANCELLED`, and `CLOSED` do not move backward.

## Verification handoff

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

Then run the database-backed scenario while API and PostgreSQL are active:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\milestone-5-5-live-scenario.ps1
```

Record only observed results in `docs/MILESTONE_5_5_QA.md`.

## Review gates

- Operators can mutate only their assigned machines, parts, plans, alerts, and requests.
- Provider assignment accepts only an active Service Provider.
- Providers cannot list or mutate unassigned work.
- Provider acceptance is required before service starts.
- Replacement warranty ranges are valid and immutable after completion submission.
- Payment approval is management-only and atomically updates parts, resolves the alert, and closes the order.
- Every successful mutation creates the expected audit action.
- Authentication, users, assets, alerts, scheduler, and legacy rows remain compatible.

## Git policy

Inspect the diff and verification results before any requested commit. Use the real current time; never backdate or fabricate Git history.
