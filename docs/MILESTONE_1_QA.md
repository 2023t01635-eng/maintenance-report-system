# Milestone 1 QA Summary

## Completed

- Created monorepo structure with `apps/api` and `apps/web`.
- Added Express API foundation with `/api`, `/api/health`, and `/api/docs`.
- Added React/Vite dashboard shell with role and workflow overview.
- Added PostgreSQL/Prisma schema for users, machines, parts, maintenance plans, alerts, work orders, evidence, and audit logs.
- Added Docker Compose for PostgreSQL, API, and web services.
- Added `AGENTS.md`, README, architecture, database, test plan, and agent workflow docs.

## Verification Run

The following commands were run successfully in the build workspace:

```powershell
npm install
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

## Notes

- `npm test` required local listener permission in the build sandbox because Supertest opens a local test server. This is normal on a developer machine.
- Docker is not installed inside this build container, so `docker compose up --build` must be verified on the Windows development PC with Docker Desktop running.
- The official university logo was not available in the workspace during this milestone, so the frontend uses text branding and the maroon/gold project palette for now.

## Next Milestone

Milestone 2 should implement:

- First admin setup
- Login/logout
- Password hashing
- Role-based middleware
- Admin user management
- Role dashboards
- Auth tests and documentation updates
