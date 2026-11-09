# Database Design

The project uses PostgreSQL because the university requirement calls for a relational database management system. Prisma provides typed access and migration history.

## Main Tables

| Table | Purpose |
|---|---|
| `User` | Accounts, roles, provider users, and machine operators |
| `Machine` | Asset identity, location, status, warranty, and assigned operator |
| `MachinePart` | Machine parts, quantity, warranty, and replacement due date |
| `MaintenancePlan` | Frequency, next due date, threshold, and active state |
| `Alert` | Warranty, replacement, and maintenance alerts |
| `WorkOrder` | Approved internal/external maintenance tasks |
| `ServiceEvidence` | Reports, invoices, payment slips, and photos |
| `AuditLog` | Important business and security actions |

## Asset Relationships

- One Machine Operator can be assigned many machines.
- Each machine has zero or one assigned operator.
- One machine can have many parts, maintenance plans, alerts, and work orders.
- An alert may reference a machine, part, or maintenance plan according to its type.
- Deleting a machine cascades to its parts, maintenance plans, and related alerts through existing foreign keys.
- Changing an assigned user's role away from Machine Operator, or deactivating that user, clears all related machine assignments atomically with the user update.

## Alert Model

| Field | Purpose |
|---|---|
| `machineId` | Parent machine used for alert scope and operator filtering |
| `partId` | Optional source part for part warranty/replacement alerts |
| `planId` | Optional source plan for maintenance due alerts |
| `type` | `MACHINE_WARRANTY`, `PART_WARRANTY`, `PART_REPLACEMENT`, or `MAINTENANCE_DUE` |
| `status` | `OPEN`, `ACKNOWLEDGED`, or `RESOLVED` |
| `dueDate` | Source deadline represented by the alert |
| `message` | Human-readable alert description |
| `dedupeKey` | Deterministic unique key for one source/type/due event |
| `acknowledgedAt` | Time the alert was acknowledged |
| `resolvedAt` | Time scheduler reconciliation resolved the alert |

`dedupeKey` has a database-level unique constraint. Application checks improve error handling, but the PostgreSQL unique index is the final protection when scheduler runs overlap.

## Scheduler Source Rules

| Source field | Eligibility |
|---|---|
| `Machine.warrantyEnd` | Date exists and is within the default 7-day warning window or overdue |
| `MachinePart.warrantyEnd` | Date exists and is within the default 7-day warning window or overdue |
| `MachinePart.replacementDue` | Date exists and is within the default 7-day warning window or overdue |
| `MaintenancePlan.nextDueDate` | Plan is active and date is within its own `thresholdDays` window or overdue |

Only `ACTIVE` and `UNDER_MAINTENANCE` machines are alertable; their parts and plans inherit the same eligibility. Reconciliation compares active alerts with current source data. An `OPEN` or `ACKNOWLEDGED` alert becomes `RESOLVED` when the corresponding condition no longer qualifies. This includes a cleared or changed source date, an inactive maintenance plan, or a machine leaving an alertable status. A new due date is a new event and therefore uses a new dedupe key when eligible. If the same due event becomes eligible again, the existing resolved row is reopened.

## Audit Records

Milestone 4 uses the existing string-based `AuditLog.action` field for:

- `ALERT_GENERATED`
- `ALERT_RESOLVED`
- `ALERT_ACKNOWLEDGED`
- `ALERT_SCHEDULER_RUN`

`AuditLog.actorId` is optional. Automatic scheduler runs may be recorded as system actions without an actor, while manual runs and acknowledgements record the authenticated user.

## Migration Note

Milestone 4 requires **no Prisma schema change and no new migration**. The initial schema already contains:

- the `Alert` model;
- `AlertType` and `AlertStatus` enums;
- machine, part, and maintenance-plan alert relationships;
- deadline and status indexes;
- the unique `Alert.dedupeKey` index;
- the `AuditLog` fields required for scheduler and alert actions.

For a fresh database, apply the existing committed migration history. For an initialized Milestone 3 database, regenerate Prisma Client but do not create an empty Milestone 4 migration.

```powershell
npm run prisma:generate
```

The schema is located at `apps/api/prisma/schema.prisma`.
