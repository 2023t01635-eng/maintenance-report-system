import { EvidenceType, Role, WorkOrderStatus } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    machine: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
    workOrder: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
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
  return { prisma, tx };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { app } from "../app.js";
import { createAuthToken } from "../modules/auth/auth.service.js";

const adminId = "11111111-1111-4111-8111-111111111111";
const providerId = "22222222-2222-4222-8222-222222222222";
const otherProviderId = "33333333-3333-4333-8333-333333333333";
const operatorId = "44444444-4444-4444-8444-444444444444";
const machineId = "55555555-5555-4555-8555-555555555555";
const workOrderId = "66666666-6666-4666-8666-666666666666";
const evidenceId = "77777777-7777-4777-8777-777777777777";

function actor(role: Role, id = `${role.toLowerCase()}-1`) {
  return {
    id,
    name: role,
    email: `${id}@example.com`,
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
const otherProvider = actor(Role.SERVICE_PROVIDER, otherProviderId);
const admin = actor(Role.ADMIN, adminId);

function workOrder(status: WorkOrderStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: workOrderId,
    machineId,
    providerId,
    approvedByOperatorId: status === WorkOrderStatus.DRAFT ? null : operatorId,
    title: "Replace spindle bearing",
    description: "Bearing noise exceeds normal limit",
    status,
    scheduledDate: new Date("2026-11-15T00:00:00.000Z"),
    completedDate: null,
    cost: 12500,
    replacedParts: "Spindle bearing",
    notes: null,
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    updatedAt: new Date("2026-11-10T00:00:00.000Z"),
    machine: {
      id: machineId,
      assetCode: "LAB-001",
      name: "CNC Lathe",
      location: "Lab A",
      operatorId,
      operator
    },
    provider,
    approvedByOperator: operator,
    evidence: [],
    ...overrides
  };
}

function authenticate(user: ReturnType<typeof actor>) {
  mocks.prisma.user.findUnique.mockResolvedValue(user);
  return bearer(user);
}

function expectAudit(action: string) {
  expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ action, actorId: expect.any(String), entityId: workOrderId })
  });
}

describe("Milestone 5 work orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
    );
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.tx.machine.findUnique.mockResolvedValue({ id: machineId });
    mocks.tx.user.findFirst.mockResolvedValue({ id: providerId });
  });

  it("requires authentication and limits draft creation to management roles", async () => {
    expect((await request(app).get("/api/work-orders")).status).toBe(401);

    const token = authenticate(operator);
    const response = await request(app)
      .post("/api/work-orders")
      .set("Authorization", token)
      .send({ machineId, title: "Repair" });
    expect(response.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("applies management, operator, and provider visibility scopes", async () => {
    mocks.prisma.workOrder.findMany.mockResolvedValue([]);

    await request(app).get("/api/work-orders").set("Authorization", authenticate(admin));
    expect(mocks.prisma.workOrder.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));

    await request(app).get("/api/work-orders").set("Authorization", authenticate(operator));
    expect(mocks.prisma.workOrder.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { machine: { operatorId } } })
    );

    await request(app).get("/api/work-orders").set("Authorization", authenticate(provider));
    expect(mocks.prisma.workOrder.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          providerId,
          status: {
            in: [
              WorkOrderStatus.APPROVED,
              WorkOrderStatus.SENT_TO_PROVIDER,
              WorkOrderStatus.IN_PROGRESS,
              WorkOrderStatus.COMPLETED
            ]
          }
        }
      })
    );
  });

  it("returns 404 when a role-scoped detail query cannot see an order", async () => {
    mocks.prisma.workOrder.findFirst.mockResolvedValue(null);
    const response = await request(app)
      .get(`/api/work-orders/${workOrderId}`)
      .set("Authorization", authenticate(provider));
    expect(response.status).toBe(404);
    expect(mocks.prisma.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: workOrderId, providerId })
      })
    );
  });

  it("returns included evidence to the assigned machine operator", async () => {
    const visible = workOrder(WorkOrderStatus.IN_PROGRESS, {
      evidence: [{ id: evidenceId, type: EvidenceType.PHOTO, fileName: "bearing.jpg" }]
    });
    mocks.prisma.workOrder.findFirst.mockResolvedValue(visible);
    const response = await request(app)
      .get(`/api/work-orders/${workOrderId}`)
      .set("Authorization", authenticate(operator));
    expect(response.status).toBe(200);
    expect(response.body.workOrder.evidence).toEqual([
      { id: evidenceId, type: EvidenceType.PHOTO, fileName: "bearing.jpg" }
    ]);
    expect(mocks.prisma.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: workOrderId, machine: { operatorId } } })
    );
  });

  it("lists only active service providers for management", async () => {
    mocks.prisma.user.findMany.mockResolvedValue([provider]);
    const allowed = await request(app).get("/api/work-orders/providers").set("Authorization", authenticate(admin));
    expect(allowed.status).toBe(200);
    expect(allowed.body.providers).toHaveLength(1);
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: Role.SERVICE_PROVIDER, isActive: true } })
    );

    const blocked = await request(app)
      .get("/api/work-orders/providers")
      .set("Authorization", authenticate(provider));
    expect(blocked.status).toBe(403);
  });

  it("creates a draft with planned service data and audits the mutation", async () => {
    const created = workOrder(WorkOrderStatus.DRAFT);
    mocks.tx.workOrder.create.mockResolvedValue(created);
    const response = await request(app)
      .post("/api/work-orders")
      .set("Authorization", authenticate(admin))
      .send({
        machineId,
        providerId,
        title: "Replace spindle bearing",
        scheduledDate: "2026-11-15",
        cost: 12500,
        replacedParts: "Spindle bearing",
        notes: "Shut down machine first"
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("workOrder.id", workOrderId);
    expect(mocks.tx.workOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          machineId,
          providerId,
          scheduledDate: new Date("2026-11-15T00:00:00.000Z"),
          cost: 12500,
          replacedParts: "Spindle bearing"
        })
      })
    );
    expectAudit("WORK_ORDER_CREATED");
  });

  it("rejects invalid dates, negative costs, missing machines, and inactive providers", async () => {
    const token = authenticate(admin);
    expect(
      (
        await request(app)
          .post("/api/work-orders")
          .set("Authorization", token)
          .send({ machineId, title: "Repair", scheduledDate: "11/15/2026" })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/work-orders")
          .set("Authorization", token)
          .send({ machineId, title: "Repair", cost: -1 })
      ).status
    ).toBe(400);

    mocks.tx.machine.findUnique.mockResolvedValueOnce(null);
    expect(
      (await request(app).post("/api/work-orders").set("Authorization", token).send({ machineId, title: "Repair" }))
        .status
    ).toBe(400);

    mocks.tx.user.findFirst.mockResolvedValueOnce(null);
    expect(
      (
        await request(app)
          .post("/api/work-orders")
          .set("Authorization", token)
          .send({ machineId, providerId, title: "Repair" })
      ).status
    ).toBe(400);
  });

  it("updates only draft fields and records replaced parts in the audit-backed update", async () => {
    const current = workOrder(WorkOrderStatus.DRAFT);
    mocks.tx.workOrder.findUnique.mockResolvedValue(current);
    mocks.tx.workOrder.update.mockResolvedValue({ ...current, replacedParts: "Bearing, oil seal" });
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set("Authorization", authenticate(admin))
      .send({ replacedParts: "Bearing, oil seal", cost: 15000 });
    expect(response.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { replacedParts: "Bearing, oil seal", cost: 15000 } })
    );
    expectAudit("WORK_ORDER_UPDATED");

    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.APPROVED));
    expect(
      (
        await request(app)
          .patch(`/api/work-orders/${workOrderId}`)
          .set("Authorization", authenticate(admin))
          .send({ title: "Changed" })
      ).status
    ).toBe(409);
  });

  it("submits a draft only when its machine has an active assigned operator", async () => {
    const current = workOrder(WorkOrderStatus.DRAFT);
    mocks.tx.workOrder.findUnique.mockResolvedValue(current);
    mocks.tx.workOrder.update.mockResolvedValue(workOrder(WorkOrderStatus.PENDING_OPERATOR_APPROVAL));
    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/submit`)
      .set("Authorization", authenticate(admin));
    expect(response.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: WorkOrderStatus.PENDING_OPERATOR_APPROVAL }) })
    );
    expectAudit("WORK_ORDER_SUBMITTED");

    mocks.tx.workOrder.findUnique.mockResolvedValue(
      workOrder(WorkOrderStatus.DRAFT, { machine: { ...current.machine, operator: null, operatorId: null } })
    );
    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/submit`)
          .set("Authorization", authenticate(admin))
      ).status
    ).toBe(400);
  });

  it("allows only the assigned operator to approve a pending order", async () => {
    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.PENDING_OPERATOR_APPROVAL));
    mocks.tx.workOrder.update.mockResolvedValue(workOrder(WorkOrderStatus.APPROVED));
    const approved = await request(app)
      .post(`/api/work-orders/${workOrderId}/approve`)
      .set("Authorization", authenticate(operator));
    expect(approved.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: WorkOrderStatus.APPROVED, approvedByOperatorId: operatorId })
      })
    );
    expectAudit("WORK_ORDER_APPROVED");

    const differentOperator = actor(Role.MACHINE_OPERATOR, "88888888-8888-4888-8888-888888888888");
    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/approve`)
          .set("Authorization", authenticate(differentOperator))
      ).status
    ).toBe(403);
  });

  it("returns 409 for an invalid operator transition", async () => {
    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.DRAFT));
    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/approve`)
      .set("Authorization", authenticate(operator));
    expect(response.status).toBe(409);
    expect(mocks.tx.workOrder.update).not.toHaveBeenCalled();
  });

  it("sends an approved order only to an active assigned provider", async () => {
    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.APPROVED));
    mocks.tx.workOrder.update.mockResolvedValue(workOrder(WorkOrderStatus.SENT_TO_PROVIDER));
    const sent = await request(app)
      .post(`/api/work-orders/${workOrderId}/send-to-provider`)
      .set("Authorization", authenticate(admin))
      .send({ providerId });
    expect(sent.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: WorkOrderStatus.SENT_TO_PROVIDER, providerId })
      })
    );
    expectAudit("WORK_ORDER_SENT_TO_PROVIDER");

    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/send-to-provider`)
          .set("Authorization", authenticate(admin))
          .send({})
      ).status
    ).toBe(400);

    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.APPROVED));
    mocks.tx.user.findFirst.mockResolvedValueOnce(null);
    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/send-to-provider`)
          .set("Authorization", authenticate(admin))
          .send({ providerId })
      ).status
    ).toBe(400);
  });

  it("isolates provider-owned start and completion transitions", async () => {
    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.SENT_TO_PROVIDER));
    mocks.tx.workOrder.update.mockResolvedValue(workOrder(WorkOrderStatus.IN_PROGRESS));
    const started = await request(app)
      .post(`/api/work-orders/${workOrderId}/start`)
      .set("Authorization", authenticate(provider));
    expect(started.status).toBe(200);
    expectAudit("WORK_ORDER_STARTED");

    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/start`)
          .set("Authorization", authenticate(otherProvider))
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .patch(`/api/work-orders/${workOrderId}/service-details`)
          .set("Authorization", authenticate(admin))
          .send({ cost: 10 })
      ).status
    ).toBe(403);

    const recordedDate = new Date("2026-11-18T00:00:00.000Z");
    mocks.tx.workOrder.findUnique.mockResolvedValue(
      workOrder(WorkOrderStatus.IN_PROGRESS, { completedDate: recordedDate })
    );
    mocks.tx.workOrder.update.mockResolvedValue(
      workOrder(WorkOrderStatus.COMPLETED, { completedDate: recordedDate })
    );
    const completed = await request(app)
      .post(`/api/work-orders/${workOrderId}/complete`)
      .set("Authorization", authenticate(provider));
    expect(completed.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: WorkOrderStatus.COMPLETED, completedDate: recordedDate })
      })
    );
    expectAudit("WORK_ORDER_COMPLETED");
  });

  it("defaults the completed service date when the provider did not record one", async () => {
    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.IN_PROGRESS));
    mocks.tx.workOrder.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...workOrder(WorkOrderStatus.COMPLETED),
      ...data
    }));
    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/complete`)
      .set("Authorization", authenticate(provider));
    expect(response.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: WorkOrderStatus.COMPLETED, completedDate: expect.any(Date) })
      })
    );
  });

  it("lets the assigned provider record service-only fields", async () => {
    const current = workOrder(WorkOrderStatus.IN_PROGRESS);
    mocks.tx.workOrder.findUnique.mockResolvedValue(current);
    mocks.tx.workOrder.update.mockResolvedValue({
      ...current,
      completedDate: new Date("2026-11-18T00:00:00.000Z"),
      cost: 18000,
      replacedParts: "Bearing, oil seal",
      notes: "Tested at full speed"
    });
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}/service-details`)
      .set("Authorization", authenticate(provider))
      .send({
        completedDate: "2026-11-18",
        cost: 18000,
        replacedParts: "Bearing, oil seal",
        notes: "Tested at full speed"
      });
    expect(response.status).toBe(200);
    expect(mocks.tx.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          completedDate: new Date("2026-11-18T00:00:00.000Z"),
          cost: 18000,
          replacedParts: "Bearing, oil seal",
          notes: "Tested at full speed"
        }
      })
    );
    expectAudit("WORK_ORDER_SERVICE_DETAILS_UPDATED");
  });

  it("blocks unassigned providers and invalid service-detail states or values", async () => {
    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.IN_PROGRESS));
    expect(
      (
        await request(app)
          .patch(`/api/work-orders/${workOrderId}/service-details`)
          .set("Authorization", authenticate(otherProvider))
          .send({ cost: 10 })
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/evidence`)
          .set("Authorization", authenticate(provider))
          .send({ type: EvidenceType.PHOTO, fileName: "photo.jpg", fileUrl: "javascript:alert(1)" })
      ).status
    ).toBe(400);

    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.COMPLETED));
    expect(
      (
        await request(app)
          .patch(`/api/work-orders/${workOrderId}/service-details`)
          .set("Authorization", authenticate(provider))
          .send({ notes: "Late edit" })
      ).status
    ).toBe(409);

    expect(
      (
        await request(app)
          .patch(`/api/work-orders/${workOrderId}/service-details`)
          .set("Authorization", authenticate(provider))
          .send({ completedDate: "18-11-2026", cost: -1 })
      ).status
    ).toBe(400);
  });

  it("allows management to cancel nonterminal orders and rejects terminal orders", async () => {
    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.IN_PROGRESS));
    mocks.tx.workOrder.update.mockResolvedValue(workOrder(WorkOrderStatus.CANCELLED));
    const cancelled = await request(app)
      .post(`/api/work-orders/${workOrderId}/cancel`)
      .set("Authorization", authenticate(admin));
    expect(cancelled.status).toBe(200);
    expectAudit("WORK_ORDER_CANCELLED");

    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.COMPLETED));
    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/cancel`)
          .set("Authorization", authenticate(admin))
      ).status
    ).toBe(409);
  });

  it("allows only the assigned provider to add immutable evidence in service states", async () => {
    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.IN_PROGRESS));
    mocks.tx.serviceEvidence.create.mockResolvedValue({
      id: evidenceId,
      workOrderId,
      type: EvidenceType.SERVICE_REPORT,
      fileName: "service-report.pdf",
      fileUrl: "/evidence/service-report.pdf",
      notes: null,
      createdAt: new Date("2026-11-18T00:00:00.000Z")
    });
    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/evidence`)
      .set("Authorization", authenticate(provider))
      .send({
        type: EvidenceType.SERVICE_REPORT,
        fileName: "service-report.pdf",
        fileUrl: "/evidence/service-report.pdf"
      });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("evidence.id", evidenceId);
    expectAudit("SERVICE_EVIDENCE_ADDED");

    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/evidence`)
          .set("Authorization", authenticate(admin))
          .send({ type: EvidenceType.PHOTO, fileName: "photo.jpg" })
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/evidence`)
          .set("Authorization", authenticate(otherProvider))
          .send({ type: EvidenceType.PHOTO, fileName: "photo.jpg" })
      ).status
    ).toBe(403);

    mocks.tx.workOrder.findUnique.mockResolvedValue(workOrder(WorkOrderStatus.APPROVED));
    expect(
      (
        await request(app)
          .post(`/api/work-orders/${workOrderId}/evidence`)
          .set("Authorization", authenticate(provider))
          .send({ type: EvidenceType.PHOTO, fileName: "photo.jpg" })
      ).status
    ).toBe(403);
  });
});
