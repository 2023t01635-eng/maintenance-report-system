# Milestone 2 QA Record

## Scope

Milestone 2 establishes secure access and role separation before maintenance records are implemented.

## Delivered

- First-user detection and one-time administrator setup
- Bcrypt password hashing
- Signed JSON Web Token session stored in an HTTP-only cookie
- Login, current-user, and logout endpoints
- Active-account checks on every protected request
- Role-based middleware and administrator-only user endpoints
- User creation, role assignment, activation, and deactivation
- Audit records for administrator creation, login, user creation, and user updates
- Role-aware dashboard summary
- Responsive University of Colombo maroon and gold interface
- Automated API and React tests

## Security Checks

| Check | Expected Result |
|---|---|
| Repeat initial setup | HTTP 409 after the first user exists |
| Plain password storage | Never stored; bcrypt hash only |
| Invalid credentials | Generic HTTP 401 response |
| Missing session | HTTP 401 on protected endpoints |
| Wrong role | HTTP 403 on administrator endpoints |
| Inactive account | Session rejected and login denied |
| Self-deactivation | Administrator receives HTTP 400 |
| Browser script cookie access | Blocked by `HttpOnly` |

## Database Impact

No new Prisma migration is required. Milestone 2 uses the `User` and `AuditLog` tables delivered by the initial schema.

## Verification Commands

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```
