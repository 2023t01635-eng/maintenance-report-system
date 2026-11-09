# Agent Workflow

Use this workflow when asking Codex to continue the Maintenance Report System.

## Milestone Flow

1. Project Lead reads the source handoff, confirms scope, and assigns non-overlapping file areas.
2. Database/API Agent implements validation, service rules, routes, transactions, audit events, migrations, and backend tests.
3. Frontend Agent implements the API client, role-aware workspace, complete UI states, responsive behavior, and frontend tests.
4. QA Agent reviews RBAC, transition validity, relationship scope, regressions, and integrated verification.
5. Docs/Demo Agent updates `README.md` and `docs/**` using only observed results.
6. Project Lead resolves findings, packages the source, and leaves Git unchanged unless the user requests a commit.

## Milestone 5 Ownership

| Agent | Responsibility |
|---|---|
| Database/API | Work-order state machine, operator/provider scope, service details, evidence metadata, audit, migration, tests |
| Frontend | Work-order list/detail, create/edit, approval, dispatch, provider workflow, evidence, responsive states, tests |
| QA | Endpoint RBAC, invalid transitions, provider isolation, URL validation, M1-M4 regressions |
| Docs/Demo | Endpoint contract, role matrix, migration, Windows demo, pending manual checks |
| Project Lead | Integration decisions, full verification, package integrity, delivery |

## Integration Contract

The status path is `DRAFT -> PENDING_OPERATOR_APPROVAL -> APPROVED -> SENT_TO_PROVIDER -> IN_PROGRESS -> COMPLETED`. Management can cancel a nonterminal order.

The assigned operator is the only user who can approve a pending order. Management sends an approved order with `{ providerId }`. Only that provider can start, update service details, add evidence, and complete it. Providers never receive draft or pending records.

## Verification Handoff

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

The Project Lead records actual counts and completes `docs/MILESTONE_5_QA.md`. Milestone 5 includes a real Prisma migration and local Windows installation must run `npm run prisma:migrate`.

## Review Gates

- State transitions enforce both current status and authenticated relationship.
- Provider assignment is selected only after operator approval.
- Provider list queries cannot reveal unassigned work.
- Operators cannot approve work for another operator's machine.
- Service details and evidence are provider-only and linked to the assigned order.
- Evidence URL validation rejects unsafe schemes.
- Successful mutations create the expected audit action.
- Milestones 1 through 4 remain green.

## Local Desktop Remote

The project uses a local bare Git repository instead of a hosted remote. The Project Lead inspects the diff and verification results before any requested commit. Use the real current time; never backdate or fabricate Git history.
