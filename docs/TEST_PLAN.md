# Test Plan

## Automated Tests

Milestone 1 includes:

- API health route test
- React dashboard render test

Run:

```powershell
npm test
```

## Next Test Areas

| Area | Tests |
|---|---|
| Authentication | Login success/failure, password hash check |
| RBAC | Admin-only user creation, provider restricted views |
| Machines | Machine CRUD and assignment checks |
| Parts | Part CRUD and due date validation |
| Alerts | Scheduler creates alerts and avoids duplicates |
| Reports | Daily/monthly data filters and export checks |

## Manual Demo Checks

1. Start Docker Desktop.
2. Run `docker compose up --build`.
3. Open `http://localhost:5173`.
4. Open `http://localhost:4000/api/health`.
5. Open `http://localhost:4000/api/docs`.
6. Confirm frontend shows API Online.
