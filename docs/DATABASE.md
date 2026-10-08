# Database Design

The project uses PostgreSQL because the university requirement asks for an RDBMS.

## Main Tables

| Table | Purpose |
|---|---|
| User | Accounts, roles, provider users, operators |
| Machine | Machinery asset records |
| MachinePart | Parts belonging to machines |
| MaintenancePlan | Preventive maintenance schedules |
| Alert | Warranty, replacement, and maintenance alerts |
| WorkOrder | Approved internal/external maintenance tasks |
| ServiceEvidence | Reports, invoices, payment slips, photos |
| AuditLog | Important business and security actions |

## Relationship Summary

- One machine can have many parts.
- One machine can have many maintenance plans.
- One maintenance plan can create many alerts.
- One machine can have many work orders.
- One work order can have many service evidence records.
- One service provider can be assigned many work orders.

The Prisma schema is located at:

```text
apps/api/prisma/schema.prisma
```
