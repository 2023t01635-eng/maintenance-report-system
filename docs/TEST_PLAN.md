# Test Plan

## Automated Tests

Milestone 2 includes:

- API health route verification
- First-time setup status and initial administrator creation
- Password hashing and invalid-login handling
- Administrator-only user management enforcement
- Frontend first-time setup rendering
- Authenticated administrator dashboard rendering

Run the complete checks:

```powershell
npm run typecheck
npm test
npm run build
```

## Manual Authentication Checks

1. Start PostgreSQL with `docker compose up db -d`.
2. Start the API with `npm run dev:api`.
3. Start the web app in another terminal with `npm run dev:web`.
4. Open `http://localhost:5173` and create the first administrator.
5. Sign out, sign in with the administrator account, and confirm the dashboard loads.
6. Add one Machine Operator account from User Management.
7. Sign in as that operator and confirm User Management is not displayed.
8. Confirm a direct request to `/api/users` with the operator session returns HTTP 403.
9. Deactivate the operator and confirm the account can no longer sign in.

## Next Test Areas

| Area | Tests |
|---|---|
| Machines | Machine create, update, assignment, and role checks |
| Parts | Part create, update, due-date validation, and deletion rules |
| Alerts | Scheduler creates alerts and avoids duplicates |
| Work orders | Approval transitions and provider visibility |
| Reports | Daily/monthly filters and export checks |
