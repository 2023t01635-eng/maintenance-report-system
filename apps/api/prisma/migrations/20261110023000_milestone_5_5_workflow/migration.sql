-- Preserve existing enum values while adding the Milestone 5.5 workflow.
ALTER TYPE "AlertType" ADD VALUE 'PAYMENT_APPROVAL';

ALTER TYPE "WorkOrderStatus" ADD VALUE 'PENDING_MANAGEMENT_APPROVAL';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'PROVIDER_ACCEPTED';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'AWAITING_PAYMENT_APPROVAL';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'CLOSED';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'REJECTED';

CREATE TYPE "WorkOrderCategory" AS ENUM (
  'BREAKDOWN_REPAIR',
  'PREVENTIVE_MAINTENANCE',
  'WARRANTY_SERVICE',
  'PART_REPLACEMENT',
  'INSPECTION',
  'OTHER'
);

CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

ALTER TABLE "WorkOrder"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "sourceAlertId" TEXT,
  ADD COLUMN "managementApprovedById" TEXT,
  ADD COLUMN "managementApprovedAt" TIMESTAMP(3),
  ADD COLUMN "paymentApprovedById" TEXT,
  ADD COLUMN "paymentApprovedAt" TIMESTAMP(3),
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "category" "WorkOrderCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "priority" "WorkOrderPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "providerAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "completionSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

ALTER TABLE "ServiceEvidence" ADD COLUMN "uploadedById" TEXT;
ALTER TABLE "Alert" ADD COLUMN "paymentWorkOrderId" TEXT;

CREATE TABLE "WorkOrderReplacement" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "machinePartId" TEXT,
  "partName" TEXT NOT NULL,
  "partNumber" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitCost" DECIMAL(12,2),
  "warrantyStart" TIMESTAMP(3),
  "warrantyEnd" TIMESTAMP(3),
  "nextReplacementDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkOrderReplacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Alert_paymentWorkOrderId_key" ON "Alert"("paymentWorkOrderId");
CREATE INDEX "Alert_paymentWorkOrderId_idx" ON "Alert"("paymentWorkOrderId");
CREATE INDEX "WorkOrder_createdById_idx" ON "WorkOrder"("createdById");
CREATE INDEX "WorkOrder_sourceAlertId_idx" ON "WorkOrder"("sourceAlertId");
CREATE INDEX "WorkOrder_managementApprovedById_idx" ON "WorkOrder"("managementApprovedById");
CREATE INDEX "WorkOrder_paymentApprovedById_idx" ON "WorkOrder"("paymentApprovedById");
CREATE INDEX "ServiceEvidence_uploadedById_idx" ON "ServiceEvidence"("uploadedById");
CREATE INDEX "WorkOrderReplacement_workOrderId_idx" ON "WorkOrderReplacement"("workOrderId");
CREATE INDEX "WorkOrderReplacement_machinePartId_idx" ON "WorkOrderReplacement"("machinePartId");

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_sourceAlertId_fkey"
  FOREIGN KEY ("sourceAlertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_managementApprovedById_fkey"
  FOREIGN KEY ("managementApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_paymentApprovedById_fkey"
  FOREIGN KEY ("paymentApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceEvidence" ADD CONSTRAINT "ServiceEvidence_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_paymentWorkOrderId_fkey"
  FOREIGN KEY ("paymentWorkOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderReplacement" ADD CONSTRAINT "WorkOrderReplacement_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderReplacement" ADD CONSTRAINT "WorkOrderReplacement_machinePartId_fkey"
  FOREIGN KEY ("machinePartId") REFERENCES "MachinePart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
