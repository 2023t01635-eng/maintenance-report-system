# Database Design

PostgreSQL provides relational storage and Prisma provides typed access and migration history.

## Main Tables

| Table | Purpose |
|---|---|
| `User` | Accounts, roles, providers, and machine operators |
| `Machine` | Asset identity, status, warranty, and assigned operator |
| `MachinePart` | Parts, quantity, warranty, and replacement date |
| `MaintenancePlan` | Frequency, next due date, threshold, and active state |
| `Alert` | Warranty, replacement, and maintenance alerts |
| `WorkOrder` | Approval, provider assignment, service state, cost, dates, parts, and notes |
| `ServiceEvidence` | Report, invoice, payment-slip, photo, and other file metadata |
| `AuditLog` | Important business and security actions |

## Work Order Relationships

- A machine can have many work orders.
- A work order belongs to one machine and can have one assigned Service Provider.
- A work order can have many evidence rows.
- Each evidence row records the uploading user.
- Operator authority is derived from `WorkOrder.machine.assignedOperatorId`; it is not duplicated on the work order.
- Provider visibility is derived from `WorkOrder.providerId` and the work-order status.

## Work Order Fields

| Field | Purpose |
|---|---|
| `status` | Current workflow state |
| `scheduledDate` | Planned service date |
| `completedDate` | Actual completion date supplied by the provider |
| `cost` | Optional nonnegative service cost |
| `replacedParts` | Provider-entered replaced-parts summary |
| `notes` | General service notes |
| `providerId` | Selected active Service Provider |
| `approvedById` / `approvedAt` | Operator approval evidence |

`ServiceEvidence` stores `type`, `fileName`, optional `fileUrl`, optional `notes`, `uploadedById`, and `createdAt`. URLs are validated as HTTP, HTTPS, or root-relative paths before persistence.

## Migration

Milestone 5 adds:

```text
apps/api/prisma/migrations/20261110004315_add_work_order_replaced_parts/migration.sql
```

The migration adds nullable `WorkOrder.replacedParts`. Apply it after extracting the package over a Milestone 4 installation:

```powershell
npm run prisma:generate
npm run prisma:migrate
```

The existing initial migration remains in the user's local repository. The Milestone 5 archive adds this migration beside that history.

## Audit Records

Work-order state changes, service detail updates, and evidence additions use the existing string-based `AuditLog.action` field. Every successful action records the authenticated actor and request context through the shared audit service.
