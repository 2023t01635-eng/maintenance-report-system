# Milestone 5 QA and Demo Record

> Historical Milestone 5 record. Milestone 5.5 replaces its operator-approval workflow; use `MILESTONE_5_5_QA.md` for current acceptance.

## Status

- Implementation: complete
- Prisma schema validation: passed on 2026-11-10
- Type checking: passed for API and web
- Automated tests: 98 passed
- Production builds: passed for API and web
- Windows/Docker/PostgreSQL workflow: pending local sign-off
- Desktop/mobile visual review: pending local sign-off

## Delivered Scope

- Management draft creation, editing, submission, dispatch, and cancellation
- Assigned Machine Operator approval before external sharing
- Active Service Provider selection during dispatch
- Assigned-provider-only visibility after approval
- Provider start, service details, evidence metadata, and completion
- Management review of completed work and evidence
- Work-order and evidence audit actions
- Responsive role-aware Work Orders workspace
- `WorkOrder.replacedParts` migration

## Role Matrix

| Role | List scope | Create/edit/submit | Approve | Dispatch/cancel | Service/evidence/complete |
|---|---|---|---|---|---|
| Admin | All | Allow | Deny | Allow | Review only |
| Owner | All | Allow | Deny | Allow | Review only |
| Manager | All | Allow | Deny | Allow | Review only |
| Machine Operator | Assigned machines | Deny | Assigned pending only | Deny | Deny |
| Service Provider | Assigned approved-or-later | Deny | Deny | Deny | Assigned orders only |

## Automated Results

| Check | Result |
|---|---|
| Prisma Client generation | Passed |
| Prisma schema validation | Passed |
| API TypeScript check | Passed |
| Web TypeScript check | Passed |
| API tests | 66 passed |
| Web tests | 32 passed |
| API production build | Passed |
| Web production build | Passed |

## Windows Installation

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
docker compose up db -d
Copy-Item .env apps/api/.env -Force

npm install
npm run prisma:generate
npm run prisma:migrate
npm run typecheck
npm test
npm run build
```

Start `npm run dev:api` in one terminal and `npm run dev:web` in another.

## Manual Acceptance Checklist

- [ ] Migration applies to the existing local PostgreSQL database.
- [ ] Work Orders navigation loads without console or API errors.
- [ ] Management can create, edit, and submit a draft.
- [ ] Only the machine's assigned operator can approve it.
- [ ] Management can select an active provider and dispatch it.
- [ ] Only the selected provider can see and start it.
- [ ] Service date, cost, replaced parts, and notes persist after refresh.
- [ ] Report, invoice, and payment-slip metadata persist after refresh.
- [ ] Provider can complete the order and management can review it.
- [ ] Invalid direct API transitions return a client error.
- [ ] Required audit actions are present.
- [ ] Desktop and narrow mobile layouts have no overlap or clipping.

## Sign-off

Automated acceptance is complete. Record Windows/Docker and browser observations here after running the package on the target computer. Do not mark unobserved checks as passed.
