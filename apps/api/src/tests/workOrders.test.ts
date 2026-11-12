import { AlertStatus, AlertType, Role, WorkOrderCategory, WorkOrderPriority, WorkOrderStatus } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    machine: { findUnique: vi.fn() },
    machinePart: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn() },
    alert: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    workOrder: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    workOrderReplacement: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), update: vi.fn() },
    workOrderPriceCounter: { create: vi.fn(), updateMany: vi.fn() },
    serviceEvidence: { create: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  const prisma = {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    workOrder: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    machine: { count: vi.fn() },
    alert: { count: vi.fn() }
  };
  return { tx, prisma };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { app } from "../app.js";
import { createAuthToken } from "../modules/auth/auth.service.js";

const machineId = "11111111-1111-4111-8111-111111111111";
const operatorId = "22222222-2222-4222-8222-222222222222";
const providerId = "33333333-3333-4333-8333-333333333333";
const managerId = "44444444-4444-4444-8444-444444444444";
const workOrderId = "55555555-5555-4555-8555-555555555555";
const alertId = "66666666-6666-4666-8666-666666666666";
const replacementId = "77777777-7777-4777-8777-777777777777";
const partId = "88888888-8888-4888-8888-888888888888";

function actor(role: Role, id: string) {
  return {
    id,
    name: role,
    email: `${role.toLowerCase()}@example.com`,
    passwordHash: "hash",
    role,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  };
}

function bearer(user: ReturnType<typeof actor>) {
  return `Bearer ${createAuthToken(user)}`;
}

const operator = actor(Role.MACHINE_OPERATOR, operatorId);
const provider = actor(Role.SERVICE_PROVIDER, providerId);
const manager = actor(Role.MANAGER, managerId);

function loadedWorkOrder(status: WorkOrderStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: workOrderId,
    machineId,
    providerId: status === WorkOrderStatus.DRAFT || status === WorkOrderStatus.PENDING_MANAGEMENT_APPROVAL ? null : providerId,
    approvedByOperatorId: null,
    createdById: operatorId,
    sourceAlertId: alertId,
    managementApprovedById: null,
    managementApprovedAt: null,
    paymentApprovedById: null,
    paymentApprovedAt: null,
    paymentReference: null,
    providerBusinessName: null,
    providerAddress: null,
    providerRegistrationNumber: null,
    providerContact: null,
    invoiceNumber: null,
    title: "Replace drive belt",
    description: "Belt replacement alert",
    category: WorkOrderCategory.PART_REPLACEMENT,
    priority: WorkOrderPriority.HIGH,
    status,
    scheduledDate: null,
    providerAcceptedAt: null,
    completionSubmittedAt: null,
    completedDate: null,
    proposedBudget: null,
    serviceCost: null,
    notes: null,
    replacedParts: null,
    rejectionReason: null,
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    updatedAt: new Date("2026-11-10T00:00:00.000Z"),
    machine: {
      id: machineId,
      assetCode: "LAB-001",
      name: "Lathe",
      category: "Machine tool",
      location: "Lab A",
      status: "ACTIVE",
      operatorId,
      operator: null
    },
    provider: null,
    approvedByOperator: null,
    createdBy: null,
    managementApprovedBy: null,
    paymentApprovedBy: null,
    sourceAlert: null,
    replacements: [],
    evidence: [],
    paymentApprovalAlert: null,
    priceCounterOffers: [],
    ...overrides
  };
}

describe("Milestone 5.5 service workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
    );
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("requires authentication and allows operators, but not providers, to create requests", async () => {
    expect((await request(app).post("/api/work-orders")).status).toBe(401);

    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    const forbidden = await request(app)
      .post("/api/work-orders")
      .set("Authorization", bearer(provider))
      .send({ machineId, title: "Provider draft" });
    expect(forbidden.status).toBe(403);

    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.tx.machine.findUnique.mockResolvedValue({ id: machineId, operatorId });
    mocks.tx.workOrder.create.mockResolvedValue(loadedWorkOrder(WorkOrderStatus.DRAFT));
    const created = await request(app)
      .post("/api/work-orders")
      .set("Authorization", bearer(operator))
      .send({ machineId, title: "Replace drive belt", category: "PART_REPLACEMENT", priority: "HIGH" });

    expect(created.status).toBe(201);
    expect(mocks.tx.workOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: operatorId, status: WorkOrderStatus.DRAFT })
    }));
  });

  it("applies role-specific visibility to the request register", async () => {
    mocks.prisma.workOrder.findMany.mockResolvedValue([]);

    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    await request(app).get("/api/work-orders").set("Authorization", bearer(operator));
    expect(mocks.prisma.workOrder.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { OR: [{ machine: { operatorId } }, { createdById: operatorId }] }
    }));

    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    await request(app).get("/api/work-orders").set("Authorization", bearer(provider));
    expect(mocks.prisma.workOrder.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ providerId })
    }));
  });

  it("links an operator request to a visible alert and prevents duplicate active requests", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.tx.machine.findUnique.mockResolvedValue({ id: machineId, operatorId });
    mocks.tx.alert.findUnique.mockResolvedValue({
      id: alertId,
      machineId,
      status: AlertStatus.OPEN,
      type: AlertType.PART_REPLACEMENT
    });
    mocks.tx.workOrder.findFirst.mockResolvedValue({ id: "existing" });

    const response = await request(app)
      .post("/api/work-orders")
      .set("Authorization", bearer(operator))
      .send({ machineId, sourceAlertId: alertId, title: "Duplicate request", category: "PART_REPLACEMENT" });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("already has an active work order");
    expect(mocks.tx.workOrder.create).not.toHaveBeenCalled();
  });

  it("submits an operator draft for management approval", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.tx.workOrder.findUnique.mockResolvedValue(loadedWorkOrder(WorkOrderStatus.DRAFT));
    mocks.tx.workOrder.update.mockResolvedValue(loadedWorkOrder(WorkOrderStatus.PENDING_MANAGEMENT_APPROVAL));

    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/submit`)
      .set("Authorization", bearer(operator));

    expect(response.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: WorkOrderStatus.PENDING_MANAGEMENT_APPROVAL })
    }));
  });

  it("lets management approve and dispatch only to an active provider", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(manager);
    mocks.tx.workOrder.findUnique.mockResolvedValue(loadedWorkOrder(WorkOrderStatus.PENDING_MANAGEMENT_APPROVAL));
    mocks.tx.user.findFirst.mockResolvedValue({ id: providerId });
    mocks.tx.workOrder.update.mockResolvedValue(loadedWorkOrder(WorkOrderStatus.SENT_TO_PROVIDER, { providerId }));

    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/approve-and-dispatch`)
      .set("Authorization", bearer(manager))
      .send({ providerId, proposedBudget: 20000 });

    expect(response.status).toBe(200);
    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: providerId, role: Role.SERVICE_PROVIDER, isActive: true }
    }));
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        providerId,
        proposedBudget: 20000,
        managementApprovedById: managerId,
        status: WorkOrderStatus.SENT_TO_PROVIDER
      })
    }));
  });

  it("requires provider acceptance before starting service", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.tx.workOrder.findUnique.mockResolvedValueOnce(
      loadedWorkOrder(WorkOrderStatus.SENT_TO_PROVIDER, { providerId })
    );
    mocks.tx.workOrder.update.mockResolvedValueOnce(
      loadedWorkOrder(WorkOrderStatus.PROVIDER_ACCEPTED, { providerId })
    );
    const accepted = await request(app)
      .post(`/api/work-orders/${workOrderId}/accept`)
      .set("Authorization", bearer(provider));
    expect(accepted.status).toBe(200);

    mocks.tx.workOrder.findUnique.mockResolvedValueOnce(
      loadedWorkOrder(WorkOrderStatus.PROVIDER_ACCEPTED, { providerId })
    );
    mocks.tx.workOrder.update.mockResolvedValueOnce(
      loadedWorkOrder(WorkOrderStatus.IN_PROGRESS, { providerId })
    );
    const started = await request(app)
      .post(`/api/work-orders/${workOrderId}/start`)
      .set("Authorization", bearer(provider));
    expect(started.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: WorkOrderStatus.IN_PROGRESS })
    }));
  });

  it("stores provider receipt identity with the service report", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.tx.workOrder.findUnique.mockResolvedValue(
      loadedWorkOrder(WorkOrderStatus.IN_PROGRESS, { providerId })
    );
    mocks.tx.workOrder.update.mockResolvedValue(
      loadedWorkOrder(WorkOrderStatus.IN_PROGRESS, {
        providerId,
        providerBusinessName: "Reliable Engineering (Pvt) Ltd",
        providerAddress: "45 Industrial Road, Colombo",
        providerRegistrationNumber: "PV-102030",
        providerContact: "+94 11 555 0199",
        invoiceNumber: "INV-2026-041"
      })
    );

    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}/service-details`)
      .set("Authorization", bearer(provider))
      .send({
        completedDate: "2026-11-19",
        serviceCost: 12500,
        notes: "Spindle serviced and tested.",
        providerBusinessName: "Reliable Engineering (Pvt) Ltd",
        providerAddress: "45 Industrial Road, Colombo",
        providerRegistrationNumber: "PV-102030",
        providerContact: "+94 11 555 0199",
        invoiceNumber: "INV-2026-041"
      });

    expect(response.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        providerBusinessName: "Reliable Engineering (Pvt) Ltd",
        providerAddress: "45 Industrial Road, Colombo",
        providerRegistrationNumber: "PV-102030",
        providerContact: "+94 11 555 0199",
        invoiceNumber: "INV-2026-041",
        serviceCost: 12500
      })
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "WORK_ORDER_SERVICE_DETAILS_UPDATED" })
    }));
  });

  it("records replacement warranty dates for the assigned provider", async () => {
    const replacement = {
      id: replacementId,
      workOrderId,
      machinePartId: partId,
      partName: "Drive belt",
      partNumber: "DB-20",
      quantity: 1,
      unitCost: 5000,
      warrantyStart: new Date("2026-11-10T00:00:00.000Z"),
      warrantyEnd: new Date("2027-11-10T00:00:00.000Z"),
      nextReplacementDate: new Date("2027-10-10T00:00:00.000Z"),
      notes: null
    };
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.tx.workOrder.findUnique.mockResolvedValue(loadedWorkOrder(WorkOrderStatus.IN_PROGRESS, {
      providerId,
      proposedBudget: 20000,
      serviceCost: 10000
    }));
    mocks.tx.machinePart.findFirst.mockResolvedValue({ id: partId });
    mocks.tx.workOrderReplacement.create.mockResolvedValue(replacement);

    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/replacements`)
      .set("Authorization", bearer(provider))
      .send({
        machinePartId: partId,
        partName: "Drive belt",
        partNumber: "DB-20",
        quantity: 1,
        unitCost: 5000,
        warrantyStart: "2026-11-10",
        warrantyEnd: "2027-11-10",
        nextReplacementDate: "2027-10-10"
      });

    expect(response.status).toBe(201);
    expect(mocks.tx.workOrderReplacement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workOrderId, machinePartId: partId, partName: "Drive belt" })
    }));
  });

  it("submits provider completion and creates a management payment alert", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.tx.workOrder.findUnique.mockResolvedValue(loadedWorkOrder(WorkOrderStatus.IN_PROGRESS, {
      providerId,
      proposedBudget: 20000,
      serviceCost: 10000
    }));
    mocks.tx.alert.upsert.mockResolvedValue({ id: alertId });
    mocks.tx.workOrder.update.mockResolvedValue(
      loadedWorkOrder(WorkOrderStatus.AWAITING_PAYMENT_APPROVAL, {
        providerId,
        proposedBudget: 20000,
        serviceCost: 10000,
        completedDate: new Date()
      })
    );

    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/submit-completion`)
      .set("Authorization", bearer(provider));

    expect(response.status).toBe(200);
    expect(mocks.tx.alert.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        paymentWorkOrderId: workOrderId,
        type: AlertType.PAYMENT_APPROVAL,
        status: AlertStatus.OPEN,
        message: expect.stringContaining("Final total: LKR 10000.00")
      })
    }));
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: WorkOrderStatus.AWAITING_PAYMENT_APPROVAL })
    }));
  });

  it("requires complete service and part costs before provider submission", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.tx.workOrder.findUnique
      .mockResolvedValueOnce(loadedWorkOrder(WorkOrderStatus.IN_PROGRESS, { providerId, serviceCost: null }))
      .mockResolvedValueOnce(loadedWorkOrder(WorkOrderStatus.IN_PROGRESS, {
        providerId,
        serviceCost: 1000,
        replacements: [{ partName: "Drive belt", quantity: 1, unitCost: null }]
      }));

    const missingServiceCost = await request(app)
      .post(`/api/work-orders/${workOrderId}/submit-completion`)
      .set("Authorization", bearer(provider));
    expect(missingServiceCost.status).toBe(409);
    expect(missingServiceCost.body.message).toContain("service or labour cost");

    const missingPartCost = await request(app)
      .post(`/api/work-orders/${workOrderId}/submit-completion`)
      .set("Authorization", bearer(provider));
    expect(missingPartCost.status).toBe(409);
    expect(missingPartCost.body.message).toContain("unit cost for Drive belt");
    expect(mocks.tx.alert.upsert).not.toHaveBeenCalled();
  });

  it("lets an owner or manager counter the provider total with a budget and message", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(manager);
    mocks.tx.workOrder.findUnique.mockResolvedValue(
      loadedWorkOrder(WorkOrderStatus.AWAITING_PAYMENT_APPROVAL, {
        proposedBudget: 12000,
        serviceCost: 10000,
        replacements: [{ quantity: 1, unitCost: 5000 }]
      })
    );
    mocks.tx.workOrderPriceCounter.create.mockResolvedValue({ id: "counter-1" });
    mocks.tx.alert.findUnique.mockResolvedValue({ id: alertId, status: AlertStatus.OPEN });
    mocks.tx.alert.update.mockResolvedValue({ id: alertId, status: AlertStatus.RESOLVED });
    mocks.tx.workOrder.update.mockResolvedValue(
      loadedWorkOrder(WorkOrderStatus.PRICE_REVISION_REQUESTED, {
        proposedBudget: 13500,
        serviceCost: 10000
      })
    );

    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/counter-payment`)
      .set("Authorization", bearer(manager))
      .send({ counterBudget: 13500, reason: "Please review the labour charge and belt unit price." });

    expect(response.status).toBe(200);
    expect(mocks.tx.workOrderPriceCounter.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workOrderId,
        createdById: managerId,
        counterBudget: 13500,
        reviewedTotal: 15000,
        reason: "Please review the labour charge and belt unit price."
      })
    });
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: WorkOrderStatus.PRICE_REVISION_REQUESTED,
        proposedBudget: 13500
      })
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "WORK_ORDER_PAYMENT_COUNTERED" })
    }));
  });

  it("allows the provider to revise a part price and resubmit without matching the counter budget", async () => {
    const counterOffer = {
      id: "counter-1",
      workOrderId,
      createdById: managerId,
      counterBudget: 13500,
      reviewedTotal: 15000,
      reason: "Review the unit price",
      respondedAt: null,
      createdAt: new Date(),
      createdBy: manager
    };
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.tx.workOrder.findUnique
      .mockResolvedValueOnce(loadedWorkOrder(WorkOrderStatus.PRICE_REVISION_REQUESTED, {
        providerId,
        proposedBudget: 13500,
        serviceCost: 9000,
        priceCounterOffers: [counterOffer]
      }))
      .mockResolvedValueOnce(loadedWorkOrder(WorkOrderStatus.PRICE_REVISION_REQUESTED, {
        providerId,
        proposedBudget: 13500,
        serviceCost: 9000,
        replacements: [{ id: replacementId, partName: "Drive belt", quantity: 1, unitCost: 4500 }],
        priceCounterOffers: [counterOffer]
      }));
    mocks.tx.workOrderReplacement.findFirst.mockResolvedValue({ id: replacementId, workOrderId });
    mocks.tx.machinePart.findFirst.mockResolvedValue({ id: partId });
    mocks.tx.workOrderReplacement.update.mockResolvedValue({ id: replacementId, partName: "Drive belt" });
    mocks.tx.alert.upsert.mockResolvedValue({ id: alertId });
    mocks.tx.workOrderPriceCounter.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.workOrder.update.mockResolvedValue(loadedWorkOrder(WorkOrderStatus.AWAITING_PAYMENT_APPROVAL, {
      providerId,
      proposedBudget: 13500,
      serviceCost: 9000
    }));

    const revised = await request(app)
      .patch(`/api/work-orders/${workOrderId}/replacements/${replacementId}`)
      .set("Authorization", bearer(provider))
      .send({
        machinePartId: partId,
        partName: "Drive belt",
        partNumber: "DB-20",
        quantity: 1,
        unitCost: 4500,
        warrantyStart: "2026-11-10",
        warrantyEnd: "2027-11-10",
        nextReplacementDate: "2027-10-10",
        notes: "Price revised after management review"
      });
    expect(revised.status).toBe(200);
    expect(mocks.tx.workOrderReplacement.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ unitCost: 4500 })
    }));

    const resubmitted = await request(app)
      .post(`/api/work-orders/${workOrderId}/submit-completion`)
      .set("Authorization", bearer(provider));
    expect(resubmitted.status).toBe(200);
    expect(mocks.tx.workOrderPriceCounter.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workOrderId, respondedAt: null }
    }));
    expect(mocks.tx.workOrder.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: WorkOrderStatus.AWAITING_PAYMENT_APPROVAL })
    }));
  });

  it("applies replacement dates and closes the order when management approves payment", async () => {
    const replacement = {
      id: replacementId,
      machinePartId: partId,
      partName: "Drive belt",
      partNumber: "DB-20",
      quantity: 1,
      unitCost: 5000,
      warrantyStart: new Date("2026-11-10T00:00:00.000Z"),
      warrantyEnd: new Date("2027-11-10T00:00:00.000Z"),
      nextReplacementDate: new Date("2027-10-10T00:00:00.000Z")
    };
    mocks.prisma.user.findUnique.mockResolvedValue(manager);
    mocks.tx.workOrder.findUnique.mockResolvedValue(
      loadedWorkOrder(WorkOrderStatus.AWAITING_PAYMENT_APPROVAL, {
        proposedBudget: 12000,
        serviceCost: 10000,
        replacements: [replacement]
      })
    );
    mocks.tx.machinePart.findFirst.mockResolvedValue({ id: partId });
    mocks.tx.machinePart.update.mockResolvedValue({ id: partId });
    mocks.tx.alert.findUnique.mockResolvedValue({ id: alertId, status: AlertStatus.OPEN });
    mocks.tx.alert.update.mockResolvedValue({ id: alertId, status: AlertStatus.RESOLVED });
    mocks.tx.workOrder.update.mockResolvedValue(
      loadedWorkOrder(WorkOrderStatus.CLOSED, { paymentReference: "PAY-001" })
    );

    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/approve-payment`)
      .set("Authorization", bearer(manager))
      .send({ paymentReference: "PAY-001" });

    expect(response.status).toBe(200);
    expect(mocks.tx.machinePart.update).toHaveBeenCalledWith({
      where: { id: partId },
      data: expect.objectContaining({
        warrantyEnd: replacement.warrantyEnd,
        replacementDue: replacement.nextReplacementDate
      })
    });
    expect(mocks.tx.alert.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: alertId },
      data: expect.objectContaining({ status: AlertStatus.RESOLVED })
    }));
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: WorkOrderStatus.CLOSED,
        paymentApprovedById: managerId,
        paymentReference: "PAY-001"
      })
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "WORK_ORDER_PAYMENT_APPROVED",
        details: expect.objectContaining({
          proposedBudget: 12000,
          serviceCost: 10000,
          partsTotal: 5000,
          finalTotal: 15000,
          budgetVariance: 3000
        })
      })
    }));
  });
});
