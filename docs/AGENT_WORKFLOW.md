# Agent Workflow

Use this workflow when asking Codex to continue the project.

## Milestone Flow

1. Project Lead reads the milestone and creates a task list.
2. Database/API Agent handles schema, routes, validation, and backend tests.
3. Frontend Agent handles screens, services, UI states, and frontend tests.
4. QA Agent runs tests and records findings.
5. Docs/Demo Agent updates README, docs, and presentation notes.
6. Project Lead integrates, checks scope, and creates a local commit.

## Suggested First Local Commit

```powershell
git add .
git commit -m "chore: initialize project foundation"
git push origin main
```

This pushes to the local bare repository created on the Desktop, not GitHub.

## Next Milestone Prompt

```text
Execute milestone 2: authentication and role management. Use the AGENTS.md workflow. Implement first admin setup, login/logout, password hashing, role-based middleware, admin user management, role dashboards, tests, and docs updates.
```
