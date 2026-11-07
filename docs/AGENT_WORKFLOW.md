# Agent Workflow

Use this workflow when asking Codex to continue the Maintenance Report System.

## Milestone Flow

1. Project Lead reads the milestone, confirms scope, and assigns non-overlapping file areas.
2. Database/API Agent implements validation, business rules, routes, audit events, and backend tests.
3. Frontend Agent implements API services, screens, loading/empty/error states, responsive behavior, and frontend tests.
4. QA Agent reviews RBAC and regression risks, then runs the integrated verification commands.
5. Docs/Demo Agent updates `README.md` and `docs/**` without claiming unobserved test results.
6. Project Lead resolves findings, records observed results, reviews the diff, and creates the local commit.

## Milestone 3 Ownership

| Agent | Milestone 3 responsibility |
|---|---|
| Database/API | Machines, parts, plans, operator filtering, assignment cleanup, audit events, API tests |
| Frontend | Assets workspace, forms, role-aware controls, responsive layout, UI tests |
| QA | CRUD/RBAC coverage, assigned-record isolation, atomic reassignment checks, regression verification |
| Docs/Demo | Setup, exact permission matrix, demo script, QA record, local commit instructions |
| Project Lead | Integration decisions, final verification, result recording, local commit/push |

## Verification Handoff

The Docs/Demo Agent leaves observed results as `Pending - Project Lead`. Only the person who runs the integrated commands records pass/fail counts.

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

## Local Desktop Remote

The project uses a local bare Git repository instead of a hosted remote.

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

git remote set-url origin "C:\Users\Malith pamuditha\Desktop\maintenance-report-system-local-remote.git"
git add -A
git commit -m "feat: add machine and maintenance management"
git push origin main
```

The Project Lead should inspect `git status`, `git diff --check`, and the verification results before committing. A normal current-time commit is sufficient; no hosted Git push is part of the local milestone workflow.
