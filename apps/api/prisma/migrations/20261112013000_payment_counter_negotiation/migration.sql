ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'PRICE_REVISION_REQUESTED';

CREATE TABLE "WorkOrderPriceCounter" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "counterBudget" DECIMAL(12,2) NOT NULL,
    "reviewedTotal" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderPriceCounter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkOrderPriceCounter_workOrderId_createdAt_idx"
ON "WorkOrderPriceCounter"("workOrderId", "createdAt");

CREATE INDEX "WorkOrderPriceCounter_createdById_idx"
ON "WorkOrderPriceCounter"("createdById");

ALTER TABLE "WorkOrderPriceCounter"
ADD CONSTRAINT "WorkOrderPriceCounter_workOrderId_fkey"
FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkOrderPriceCounter"
ADD CONSTRAINT "WorkOrderPriceCounter_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
