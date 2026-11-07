# Milestone 3 QA and Demo Record

## Scope

Milestone 3 introduces the asset register for machines, machine parts, preventive maintenance plans, operator assignment, exact role-based access control, and mutation audit events.

## Delivered Behavior Checklist

| Item | Expected behavior | Project Lead observation |
|---|---|---|
| Machine records | Asset code, status, warranty, location, and operator are manageable | Pending |
| Machine parts | Quantity, warranty, and replacement due date are manageable per machine | Pending |
| Maintenance plans | Frequency, custom interval, next due date, threshold, and active state are manageable | Pending |
| Operator visibility | Operator sees only assigned machine records in read-only mode | Pending |
| Service Provider | Asset register is unavailable | Pending |
| Audit trail | Successful asset mutations write audit records | Pending |
| Assignment cleanup | Deactivation/role change atomically clears the user's machine assignments | Pending |
| Responsive UI | Desktop and mobile-width Assets workspace remain usable | Pending |

## Exact RBAC Policy

| Role | Policy |
|---|---|
| Admin | Full machine, part, and maintenance-plan access, including all deletes |
| Owner | Read all; create/update machines, parts, and plans; no deletes |
| Manager | Read all; create/update machines, parts, and plans; delete parts/plans; no machine delete |
| Machine Operator | Read only the assigned machine and its parts/plans; no mutations |
| Service Provider | No Milestone 3 asset-register access |

## Database Impact

No new Prisma migration is required. Milestone 3 uses the machine, part, maintenance-plan, user, and audit structures already present in the initial schema.

## Automated Results

The Project Lead ran the complete integrated verification on 7 November 2026.

| Command | Expected | Observed result | Status |
|---|---|---|---|
| `npm run prisma:generate` | Prisma Client generation completes | Prisma Client 6.19.3 generated | Passed |
| `npm run typecheck` | API and web TypeScript checks complete | API and web checks completed | Passed |
| `npm test` | API and web test suites complete | API: 4 files, 32 tests; web: 2 files, 10 tests | Passed |
| `npm run build` | API and production web builds complete | API build passed; Vite transformed 1,675 modules | Passed |

`npm audit fix` applied all available non-breaking production dependency fixes. `npm audit --omit=dev` reports one remaining high-severity Prisma tooling advisory family (three linked entries); its published fix requires the breaking Prisma 7 upgrade and is deferred to a dedicated dependency-upgrade milestone. No production critical or moderate advisories remain.

The automated suite includes an explicit frontend assertion for the API's `/machines/:id/plans` contract and a bounded retry test for serializable assignment conflicts. The Windows/Docker/PostgreSQL workflow and responsive visual checks below remain pending local sign-off.

## Manual QA Checklist

- [ ] Admin can create, update, and delete a machine.
- [ ] Owner can create/update records but sees no delete controls and receives HTTP 403 for direct delete requests.
- [ ] Manager can delete parts/plans but cannot delete a machine.
- [ ] Machine Operator sees only assigned records and cannot mutate them through UI or direct API requests.
- [ ] Service Provider cannot open or call the asset register.
- [ ] Invalid warranty ordering, non-positive part quantity, and invalid threshold/custom intervals are rejected.
- [ ] Switching selected machines does not leave an editor targeting the previous machine.
- [ ] Child records cannot be accessed through a mismatched parent machine ID.
- [ ] Deactivating an operator clears assignments in the same transaction as the user update.
- [ ] Changing an operator to a different role clears assignments in the same transaction as the user update.
- [ ] Mutation audit records identify actor, action, entity type, and entity ID.
- [ ] Assets UI is usable at desktop and narrow mobile widths.
- [ ] No unexpected browser-console or API-log errors appear during the demo.

## Windows Demo Preparation

```powershell
Set-Location "C:\Users\Malith pamuditha\Desktop\maintenance-report-system"

Copy-Item .env.example .env -Force
Copy-Item .env apps/api/.env -Force
npm install
npm run prisma:generate
docker compose up db -d
```

For an existing Milestone 2 database, no Milestone 3 migration command is needed. For a new empty database, apply the existing committed migration history with `npm run prisma:migrate`.

Run the API and web app in separate PowerShell windows:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

## Local Commit

After the Project Lead completes the results table and reviews the integrated diff:

```powershell
git remote set-url origin "C:\Users\Malith pamuditha\Desktop\maintenance-report-system-local-remote.git"
git add -A
git commit -m "feat: add machine and maintenance management"
git push origin main
```

The destination is the local Desktop bare repository, not a hosted Git service.
