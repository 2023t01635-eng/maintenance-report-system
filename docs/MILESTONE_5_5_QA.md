# Milestone 5.5 QA and Demo Record

## Status

- Implementation: complete
- Prisma schema validation: passed on 2026-11-12
- Type checking: passed for API and web
- Automated tests: 100 passed
- Production builds: passed for API and web
- Windows/Docker/PostgreSQL live scenario: pending target-machine sign-off
- Desktop/mobile browser review: pending target-machine sign-off

## Delivered scope

- Operator creation and maintenance of owned machines, parts, warranty/replacement dates, and plans
- Alert acknowledge and reversible reopen action
- Alert-to-request prefill with category and machine context
- Corrected management approval and active-provider dispatch
- Explicit provider acceptance before service start
- Structured replacement lines with warranty and next replacement dates
- Provider service details, evidence metadata, and printable service slip
- Completion-created payment approval alert
- Admin, Owner, or Manager payment approval and closure
- Atomic application of replacement dates to the asset register
- Role, relationship, transition, and audit enforcement in the API
- Responsive workflow UI with a price-revision branch and empty-provider warning
- Real Prisma migration and Windows acceptance script
- Assigned-provider request access without protected asset API calls
- Role-scoped recent activity on Operator and Service Provider overviews
- Administrator organization identity and provider receipt/invoice fields
- Responsive alert actions that wrap without covering due dates
- Management-proposed budget separated from provider service and parts costs
- Automatic parts total, final total, and over/under-budget variance
- Repeatable Owner/Manager price counteroffers with revised budget and required message
- Provider labour and part-price revision with no forced equality to the counter budget
- Exact Admin/Owner/Manager/Operator/Provider activity-log visibility hierarchy
- Payment dashboard with management cash outflow, provider-only cash inflow, monthly comparison, parts, approver, and budget variance
- Perspective-aware variance colors: management overspend is red, while provider income above budget is green

## Role matrix

| Role | Asset/request scope | Dispatch | Provider service | Payment approval / counter |
|---|---|---|---|---|
| Admin | All; user administration | Allow | Review only | Approve only |
| Owner | All | Allow | Review only | Approve and counter |
| Manager | All; daily operations | Allow | Review only | Approve and counter |
| Machine Operator | Own machines and requests | Deny | Deny | Deny |
| Service Provider | Assigned dispatched-or-later | Deny | Assigned requests only | Deny |

## Automated results

| Check | Observed result |
|---|---|
| `npm run prisma:generate` | Passed |
| `prisma validate` | Passed |
| `npm run typecheck` | Passed |
| API tests | 71 passed in 7 files |
| Web tests | 29 passed in 4 files |
| API build | Passed |
| Web build | Passed; 1,678 modules transformed |

## Windows installation

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
docker compose up db -d
Copy-Item .env.example .env -Force
Copy-Item .env apps/api/.env -Force

npm install
npm run prisma:generate
npm run prisma:migrate
npm run typecheck
npm test
npm run build
```

Start `npm run dev:api` in one terminal and `npm run dev:web` in another. Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\milestone-5-5-live-scenario.ps1
```

## Target-machine acceptance checklist

- [ ] Migration applies to the existing PostgreSQL database.
- [ ] API and web start without Prisma DLL or fetch errors.
- [ ] The automated live scenario prints its pass message.
- [ ] Operator can register and update only their own machine and dates.
- [ ] Alert acknowledge and reopen both persist after refresh.
- [ ] Alert creates a categorized request with machine details visible.
- [ ] Management can select an active provider and dispatch.
- [ ] Management must enter a proposed budget before dispatch.
- [ ] Provider must accept before starting.
- [ ] Assigned provider can open the request without a permission error.
- [ ] Replacement, evidence, cost, and service notes persist after refresh.
- [ ] Provider business, address, registration, contact, and invoice fields persist after refresh.
- [ ] Existing and extra replacement parts contribute quantity times unit cost to the parts total.
- [ ] Final total equals service/labour charge plus all part line totals.
- [ ] Management sees the final total and budget variance before payment approval.
- [ ] Owner and Manager can counter with a revised budget and required reason/message.
- [ ] Provider sees the counter message, edits labour or part prices, and resubmits a total that is not forced to equal the counter budget.
- [ ] Management can counter repeatedly or approve the revised receipt.
- [ ] Printable service slip contains organization, provider, invoice, service, and replacement details.
- [ ] Operator and provider overview activity is present and correctly scoped.
- [ ] Admin sees all activity; Owner sees Owner/Manager/Operator; Manager sees Manager/Operator.
- [ ] Operator and Service Provider each see only activity they personally performed.
- [ ] Admin, Owner, and Manager payment tabs show finalized organization cash outflow.
- [ ] Service Provider payment tab shows only that provider's finalized cash inflow.
- [ ] Payment ledger shows machine, replaced parts, date/reference, named approver, value, and budget variance.
- [ ] Monthly payment chart compares actual cash flow with the proposed budget.
- [ ] Management sees over-budget payments in red and under-budget payments in green.
- [ ] Service Provider sees over-budget income in green and under-budget income in red.
- [ ] Alert actions do not overlap the due-date column.
- [ ] Completion creates a management payment alert.
- [ ] Admin, Owner, and Manager can each approve payment.
- [ ] Payment approval closes the request and updates part dates.
- [ ] Unauthorized operators and providers receive backend denial.
- [ ] Desktop and narrow mobile layouts have no overlap or clipping.

## Sign-off boundary

Automated acceptance is complete. Docker/PostgreSQL and PowerShell were unavailable in the delivery workspace, so their checkboxes remain deliberately unmarked until the script is run on the target Windows 11 computer.
