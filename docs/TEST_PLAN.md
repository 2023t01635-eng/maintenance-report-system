# Test Plan

## Automated Verification

Run the complete workspace checks from the repository root:

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

The Project Lead records the observed outcome and test counts in `docs/MILESTONE_3_QA.md`. Documentation must not mark a command as passed until it has run on the integrated Milestone 3 tree.

## API Coverage

| Area | Required automated checks |
|---|---|
| Authentication | Anonymous asset requests return HTTP 401 |
| Machine reads | Admin/Owner/Manager see all; operator sees assigned only; provider receives HTTP 403 |
| Machine writes | Admin/Owner/Manager can create and update; operator/provider receive HTTP 403 |
| Machine delete | Admin succeeds; all other roles receive HTTP 403 |
| Assignment | Only active Machine Operator accounts can be assigned |
| User update | Deactivation or role change clears machine assignments atomically |
| Parts | Authorized create/update; Admin/Manager delete; Owner/operator/provider cannot delete |
| Plans | Authorized create/update; Admin/Manager delete; Owner/operator/provider cannot delete |
| Parent isolation | Part/plan requests reject records belonging to another machine ID |
| Validation | Asset-code, date ordering, quantity, threshold, and custom-frequency rules |
| Audit | Successful asset mutations create the expected audit event |

## Frontend Coverage

| Area | Required automated checks |
|---|---|
| Assets list | Loading, populated, empty, and API-error states |
| Selection | Machine detail, parts, and plans refresh when the selected machine changes |
| Editor safety | Changing selection closes or safely binds any open machine editor |
| Admin controls | Machine and nested create/update/delete controls visible |
| Owner controls | Create/update visible; machine and nested deletes hidden |
| Manager controls | Create/update and nested deletes visible; machine delete hidden |
| Operator controls | Assigned data renders read-only; mutation controls hidden |
| Service Provider | Asset workspace navigation is not displayed |
| Forms | Machine, part, and plan submissions send the expected payload and refresh data |

## Manual Milestone 3 Demo Checks

1. Start PostgreSQL with `docker compose up db -d`.
2. Start the API with `npm run dev:api`.
3. Start the web app in another PowerShell window with `npm run dev:web`.
4. Sign in as Admin and create an active Machine Operator.
5. Create a machine, assign the operator, and add warranty dates.
6. Add a part with quantity, warranty, and replacement dates.
7. Add a maintenance plan with frequency, next due date, and threshold.
8. Edit each record and confirm the refreshed values.
9. Verify the role/action matrix below using separate accounts.
10. Deactivate or change the assigned operator's role and confirm the assignment is cleared.
11. Check desktop and narrow mobile-width layouts for overlap, clipping, and usable controls.
12. Confirm the browser console and API log contain no unexpected errors.

## RBAC Acceptance Matrix

| Role | Read | Machine create/update | Machine delete | Part/plan create/update | Part/plan delete |
|---|---|---|---|---|---|
| Admin | All records | Allow | Allow | Allow | Allow |
| Owner | All records | Allow | Deny | Allow | Deny |
| Manager | All records | Allow | Deny | Allow | Allow |
| Machine Operator | Assigned records only | Deny | Deny | Deny | Deny |
| Service Provider | No asset-register access | Deny | Deny | Deny | Deny |

## Regression Areas

- First administrator setup and login/logout still work.
- User Management remains Admin-only.
- Inactive accounts cannot sign in or continue using an old session.
- Health and dashboard endpoints retain their previous behavior.
- Existing Milestone 1 migration remains the complete schema migration; Milestone 3 adds no migration.

## Later Milestones

| Area | Planned tests |
|---|---|
| Alerts | Scheduler creates alerts and avoids duplicates |
| Work orders | Approval transitions and provider visibility |
| Evidence | File metadata, role restrictions, and work-order linkage |
| Reports | Daily/monthly filters and export checks |
