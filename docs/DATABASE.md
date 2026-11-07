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

## Milestone 3 Relationships

- One Machine Operator can be assigned many machines.
- Each machine has zero or one assigned operator.
- One machine can have many parts.
- One machine can have many maintenance plans.
- Deleting a machine cascades to its parts and maintenance plans through existing foreign-key relationships.
- Changing an assigned user's role away from Machine Operator, or deactivating that user, clears all related machine assignments atomically with the user update.

## Asset Fields

| Record | Important fields |
|---|---|
| Machine | Asset code, name, category, location, manufacturer, model, serial number, warranty start/end, status, operator |
| Machine Part | Name, part number, quantity, warranty start/end, replacement due date |
| Maintenance Plan | Title, description, frequency, custom interval days, next due date, threshold days, active state |

`CUSTOM` maintenance frequency requires an interval in days. Warranty and replacement fields are optional, while every maintenance plan requires a next due date.

## Migration Note

Milestone 3 uses the `Machine`, `MachinePart`, `MaintenancePlan`, `User`, and `AuditLog` structures already delivered in the initial Prisma schema. It does not introduce a new Prisma migration.

For a fresh database, apply the existing committed migration history. For an already initialized Milestone 2 database, regenerate Prisma Client but do not create an empty Milestone 3 migration.

```powershell
npm run prisma:generate
```

The schema is located at `apps/api/prisma/schema.prisma`.
