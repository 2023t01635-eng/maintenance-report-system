# Database Design

PostgreSQL provides relational storage and Prisma provides typed access and migration history.

## Main tables

| Table | Purpose |
|---|---|
| `User` | Accounts and role identities |
| `Machine` | Asset identity, status, warranty, and assigned operator |
| `MachinePart` | Installed parts, quantity, warranty, and replacement due date |
| `MaintenancePlan` | Frequency, next due date, threshold, and active state |
| `Alert` | Asset due alerts plus management payment alerts |
| `WorkOrder` | Service request state, category, priority, actors, dates, proposed budget, service cost, and approval data |
| `WorkOrderReplacement` | Structured replaced-part line, cost, warranty, and next replacement date |
| `WorkOrderPriceCounter` | Immutable owner/manager counter budget, message, reviewed total, and provider response time |
| `ServiceEvidence` | Report, invoice, payment-slip, photo, and other metadata |
| `AuditLog` | Security and business mutation history |
| `OrganizationProfile` | Administrator-managed organization heading, address, registration, and contact details for reports |

## Work-order relationships

- A machine has many work orders.
- A work order can reference the alert that initiated it.
- A work order has optional creator, provider, management approver, and payment approver users.
- A work order has many replacement lines and evidence rows.
- A work order has an ordered history of price counteroffers.
- A replacement can reference an existing machine part or create a new part at payment approval.
- A payment approval alert has a unique work-order relationship.
- Provider visibility derives from `providerId` and status; operator scope derives from machine assignment or request creator.
- Payment analytics derive from approved `CLOSED` work orders; provider inflow is additionally scoped by `providerId`.

## Important fields

| Field | Purpose |
|---|---|
| `WorkOrder.category` | Breakdown, preventive, warranty, replacement, inspection, or other |
| `WorkOrder.priority` | Low, normal, high, or urgent |
| `createdById` | User who raised the request |
| `sourceAlertId` | Due alert that initiated the request |
| `managementApprovedById` / `managementApprovedAt` | Dispatch authorization |
| `providerAcceptedAt` | Provider acknowledgement timestamp |
| `completionSubmittedAt` | Provider handoff to payment review |
| `paymentApprovedById` / `paymentApprovedAt` | Final management approval |
| `paymentReference` | Invoice or transaction reference |
| `providerBusinessName` / `providerAddress` | Provider identity captured for the completed service receipt |
| `providerRegistrationNumber` / `providerContact` | Provider registration and contact shown on the receipt |
| `invoiceNumber` | Provider invoice or receipt number |
| `proposedBudget` | Organization amount proposed during management dispatch; mapped to the existing `cost` database column |
| `serviceCost` | Provider-entered service or labour charge, excluding replacement parts |
| `WorkOrderReplacement.quantity * unitCost` | Calculated line total used in the parts total |
| `WorkOrderReplacement.warrantyEnd` | New part warranty end |
| `WorkOrderReplacement.nextReplacementDate` | Date copied to `MachinePart.replacementDue` at closure |
| `WorkOrderPriceCounter.counterBudget` | Revised management negotiation target |
| `WorkOrderPriceCounter.reviewedTotal` | Provider final total management reviewed before countering |
| `WorkOrderPriceCounter.reason` / `respondedAt` | Management message and provider resubmission time |

## Migrations

Milestone 5 base field:

```text
apps/api/prisma/migrations/20261110004315_add_work_order_replaced_parts/migration.sql
```

Milestone 5.5 workflow:

```text
apps/api/prisma/migrations/20261110023000_milestone_5_5_workflow/migration.sql
```

Milestone 5.5 activity and receipt identity:

```text
apps/api/prisma/migrations/20261111190000_activity_and_receipt_identity/migration.sql
```

Milestone 5.5 proposed budget and actual total:

```text
apps/api/prisma/migrations/20261112001500_proposed_budget_and_actual_total/migration.sql
```

Milestone 5.5 payment counter negotiation:

```text
apps/api/prisma/migrations/20261112013000_payment_counter_negotiation/migration.sql
```

Apply both pending migrations to the existing local database:

```powershell
npm run prisma:generate
npm run prisma:migrate
```

The migrations preserve legacy enum values and add the corrected statuses, alert type, category/priority enums, approver fields, uploader field, payment relationship, replacement and price-counter tables, receipt identity fields, organization profile, service-cost field, indexes, and foreign keys. Parts total, final total, and budget variance are derived from persisted values rather than duplicated database columns.

The Payments tab adds no reporting table or migration. Its cash-flow totals and monthly groups are read models calculated from `WorkOrder`, `WorkOrderReplacement`, machine, provider, and payment-approver relationships.

## Transaction rule

Workflow mutations use serializable Prisma transactions. Payment approval updates or creates machine parts, resolves the payment alert, closes the request, and writes one audit event atomically. A failure rolls back the whole operation.
