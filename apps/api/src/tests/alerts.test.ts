import { AlertStatus, AlertType, Role } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    machine: { findMany: vi.fn() },
    machinePart: { findMany: vi.fn() },
    maintenancePlan: { findMany: vi.fn() },
    alert: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  const prisma = {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn(), count: vi.fn() },
    alert: { findMany: vi.fn(), count: vi.fn() },
    machine: { count: vi.fn(), findMany: vi.fn() },
    workOrder: { count: vi.fn(), findMany: vi.fn() },
    auditLog: { findMany: vi.fn() }
  };
  return { prisma, tx };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { app } from "../app.js";
import { createAuthToken } from "../modules/auth/auth.service.js";
import { millisecondsUntilNextRun } from "../modules/alerts/alerts.scheduler.js";
import { runAlertScheduler } from "../modules/alerts/alerts.service.js";

const operatorId = "operator-1";
const machineId = "machine-1";
const alertId = "alert-1";

function actor(role: Role, id = `${role.toLowerCase()}-1`) {
  return {
    id, name: role, email: `${role.toLowerCase()}@example.com`, passwordHash: "hash", role, isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z")
  };
}

function bearer(user: ReturnType<typeof actor>) {
  return `Bearer ${createAuthToken(user)}`;
}

const alert = {
  id: alertId, machineId, partId: null, planId: "plan-1", type: AlertType.MAINTENANCE_DUE,
  status: AlertStatus.OPEN, dueDate: new Date("2026-11-12T00:00:00.000Z"),
  message: "Monthly inspection is due", dedupeKey: "MAINTENANCE_DUE:plan-1:2026-11-12",
  acknowledgedAt: null, resolvedAt: null, createdAt: new Date("2026-11-09T00:00:00.000Z"),
  updatedAt: new Date("2026-11-09T00:00:00.000Z"),
  machine: { id: machineId, assetCode: "LAB-001", name: "Lathe", location: "Lab A", operatorId },
  part: null, plan: { id: "plan-1", title: "Monthly inspection" }
};

function emptySchedulerSources() {
  mocks.tx.machine.findMany.mockResolvedValue([]);
  mocks.tx.machinePart.findMany.mockResolvedValue([]);
  mocks.tx.maintenancePlan.findMany.mockResolvedValue([]);
  mocks.tx.alert.findMany.mockResolvedValue([]);
}

describe("Milestone 4 alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.tx.$queryRaw.mockResolvedValue([]);
  });

  it("requires authentication and blocks service providers", async () => {
    expect((await request(app).get("/api/alerts")).status).toBe(401);
    const provider = actor(Role.SERVICE_PROVIDER);
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    expect((await request(app).get("/api/alerts").set("Authorization", bearer(provider))).status).toBe(403);
    expect(mocks.prisma.alert.findMany).not.toHaveBeenCalled();
  });

  it("scopes an operator's alert list to assigned machines", async () => {
    const operator = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.prisma.alert.findMany.mockResolvedValueOnce([alert]).mockResolvedValueOnce([alert]);
    const response = await request(app).get("/api/alerts").set("Authorization", bearer(operator));
    expect(response.status).toBe(200);
    expect(response.body.summary.open).toBe(1);
    expect(mocks.prisma.alert.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ machine: { operatorId } })
    }));
  });

  it("scopes operator dashboard totals to assigned records", async () => {
    const operator = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.prisma.machine.count.mockResolvedValue(1);
    mocks.prisma.alert.count.mockResolvedValue(2);
    mocks.prisma.workOrder.count.mockResolvedValue(3);
    const response = await request(app).get("/api/dashboard/summary").set("Authorization", bearer(operator));
    expect(response.body.totals).toEqual({ machines: 1, openAlerts: 2, activeWorkOrders: 3, activeUsers: 1 });
    expect(mocks.prisma.machine.count).toHaveBeenCalledWith({ where: { operatorId } });
    expect(mocks.prisma.user.count).not.toHaveBeenCalled();
  });

  it("does not expose machine, alert, or user totals to service providers", async () => {
    const provider = actor(Role.SERVICE_PROVIDER, "provider-1");
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.prisma.machine.count.mockResolvedValue(0);
    mocks.prisma.alert.count.mockResolvedValue(0);
    mocks.prisma.workOrder.count.mockResolvedValue(2);
    const response = await request(app).get("/api/dashboard/summary").set("Authorization", bearer(provider));
    expect(response.body.totals).toEqual({ machines: 0, openAlerts: 0, activeWorkOrders: 2, activeUsers: 1 });
    expect(mocks.prisma.workOrder.count).toHaveBeenCalledWith({
      where: {
        providerId: "provider-1",
        status: { in: ["SENT_TO_PROVIDER", "PROVIDER_ACCEPTED", "IN_PROGRESS", "PRICE_REVISION_REQUESTED", "AWAITING_PAYMENT_APPROVAL"] }
      }
    });
  });

  it("shows service providers only audit events they performed themselves", async () => {
    const provider = actor(Role.SERVICE_PROVIDER, "provider-1");
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.prisma.auditLog.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get("/api/dashboard/activity")
      .set("Authorization", bearer(provider));

    expect(response.status).toBe(200);
    expect(mocks.prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { actorId: "provider-1" },
      take: 25
    }));
  });

  it("shows machine operators only audit events they performed themselves", async () => {
    const operator = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.prisma.auditLog.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get("/api/dashboard/activity")
      .set("Authorization", bearer(operator));

    expect(response.status).toBe(200);
    expect(mocks.prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { actorId: operatorId }
    }));
  });

  it("applies the owner and manager activity hierarchy by actor role", async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([]);

    const owner = actor(Role.OWNER, "owner-1");
    mocks.prisma.user.findUnique.mockResolvedValueOnce(owner);
    const ownerResponse = await request(app).get("/api/dashboard/activity").set("Authorization", bearer(owner));
    expect(ownerResponse.status).toBe(200);
    expect(mocks.prisma.auditLog.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { actor: { role: { in: [Role.OWNER, Role.MANAGER, Role.MACHINE_OPERATOR] } } }
    }));

    const manager = actor(Role.MANAGER, "manager-1");
    mocks.prisma.user.findUnique.mockResolvedValueOnce(manager);
    const managerResponse = await request(app).get("/api/dashboard/activity").set("Authorization", bearer(manager));
    expect(managerResponse.status).toBe(200);
    expect(mocks.prisma.auditLog.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { actor: { role: { in: [Role.MANAGER, Role.MACHINE_OPERATOR] } } }
    }));
  });

  it("shows administrators the complete audit feed", async () => {
    const admin = actor(Role.ADMIN, "admin-1");
    mocks.prisma.user.findUnique.mockResolvedValue(admin);
    mocks.prisma.auditLog.findMany.mockResolvedValue([]);

    const response = await request(app).get("/api/dashboard/activity").set("Authorization", bearer(admin));

    expect(response.status).toBe(200);
    expect(mocks.prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("returns finalized cash inflow only for the signed-in service provider", async () => {
    const provider = actor(Role.SERVICE_PROVIDER, "provider-1");
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.prisma.workOrder.findMany.mockResolvedValue([{
      id: "work-order-1",
      title: "Lathe service",
      proposedBudget: 20000,
      serviceCost: 9000,
      completedDate: new Date("2026-11-10T00:00:00.000Z"),
      paymentApprovedAt: new Date("2026-11-12T00:00:00.000Z"),
      paymentReference: "PAY-001",
      machine: { id: machineId, assetCode: "LAB-001", name: "Lathe" },
      provider: { id: "provider-1", name: "Engineering Centre", email: "provider@example.com" },
      paymentApprovedBy: { id: "manager-1", name: "Workshop Manager", role: Role.MANAGER },
      replacements: [{ id: "replacement-1", partName: "Drive belt", partNumber: "DB-20", quantity: 1, unitCost: 9500 }]
    }]);

    const response = await request(app).get("/api/dashboard/payments").set("Authorization", bearer(provider));

    expect(response.status).toBe(200);
    expect(mocks.prisma.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "CLOSED", paymentApprovedAt: { not: null }, providerId: "provider-1" }
    }));
    expect(response.body.direction).toBe("INFLOW");
    expect(response.body.summary).toEqual(expect.objectContaining({
      paymentTotal: 18500,
      budgetTotal: 20000,
      underBudgetAmount: 1500,
      netVariance: -1500,
      paymentCount: 1
    }));
    expect(response.body.payments[0]).toEqual(expect.objectContaining({
      paymentValue: 18500,
      variance: -1500,
      approvedBy: expect.objectContaining({ name: "Workshop Manager" })
    }));
  });

  it("returns organization-wide finalized payments as management cash outflow", async () => {
    const manager = actor(Role.MANAGER, "manager-1");
    mocks.prisma.user.findUnique.mockResolvedValue(manager);
    mocks.prisma.workOrder.findMany.mockResolvedValue([]);

    const response = await request(app).get("/api/dashboard/payments").set("Authorization", bearer(manager));

    expect(response.status).toBe(200);
    expect(response.body.direction).toBe("OUTFLOW");
    expect(mocks.prisma.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "CLOSED", paymentApprovedAt: { not: null } }
    }));
  });

  it("denies the payment ledger to machine operators", async () => {
    const operator = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(operator);

    const response = await request(app).get("/api/dashboard/payments").set("Authorization", bearer(operator));

    expect(response.status).toBe(403);
    expect(mocks.prisma.workOrder.findMany).not.toHaveBeenCalled();
  });

  it("applies status and type filters without removing role scope", async () => {
    const operator = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.prisma.alert.findMany.mockResolvedValue([]);
    const response = await request(app).get("/api/alerts?status=ACKNOWLEDGED&type=PART_REPLACEMENT").set("Authorization", bearer(operator));
    expect(response.status).toBe(200);
    expect(mocks.prisma.alert.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        machine: { operatorId },
        NOT: { type: AlertType.PAYMENT_APPROVAL },
        status: AlertStatus.ACKNOWLEDGED,
        type: AlertType.PART_REPLACEMENT
      }
    }));
  });

  it("rejects unsupported alert filters", async () => {
    const admin = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(admin);
    expect((await request(app).get("/api/alerts?status=IGNORED").set("Authorization", bearer(admin))).status).toBe(400);
    expect(mocks.prisma.alert.findMany).not.toHaveBeenCalled();
  });

  it("acknowledges a visible alert and writes its audit record atomically", async () => {
    const operator = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.tx.alert.findFirst.mockResolvedValue(alert);
    mocks.tx.alert.update.mockResolvedValue({ ...alert, status: AlertStatus.ACKNOWLEDGED, acknowledgedAt: new Date() });
    const response = await request(app).patch(`/api/alerts/${alertId}/acknowledge`).set("Authorization", bearer(operator));
    expect(response.status).toBe(200);
    expect(mocks.tx.alert.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: alertId, machine: { operatorId }, NOT: { type: AlertType.PAYMENT_APPROVAL } }
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "ALERT_ACKNOWLEDGED", actorId: operatorId })
    }));
  });

  it("does not acknowledge alerts outside the operator's scope", async () => {
    const operator = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.tx.alert.findFirst.mockResolvedValue(null);
    const response = await request(app).patch(`/api/alerts/${alertId}/acknowledge`).set("Authorization", bearer(operator));
    expect(response.status).toBe(404);
    expect(mocks.tx.alert.update).not.toHaveBeenCalled();
  });

  it("reopens an acknowledged alert and records the reversal", async () => {
    const operator = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(operator);
    mocks.tx.alert.findFirst.mockResolvedValue({ ...alert, status: AlertStatus.ACKNOWLEDGED });
    mocks.tx.alert.update.mockResolvedValue({ ...alert, status: AlertStatus.OPEN, acknowledgedAt: null });

    const response = await request(app)
      .patch(`/api/alerts/${alertId}/reopen`)
      .set("Authorization", bearer(operator));

    expect(response.status).toBe(200);
    expect(mocks.tx.alert.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: alertId },
      data: { status: AlertStatus.OPEN, acknowledgedAt: null }
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "ALERT_REOPENED", actorId: operatorId })
    }));
  });

  it("keeps acknowledgement idempotent and rejects resolved alerts", async () => {
    const manager = actor(Role.MANAGER);
    mocks.prisma.user.findUnique.mockResolvedValue(manager);
    mocks.tx.alert.findFirst.mockResolvedValueOnce({ ...alert, status: AlertStatus.ACKNOWLEDGED }).mockResolvedValueOnce({ ...alert, status: AlertStatus.RESOLVED });
    expect((await request(app).patch(`/api/alerts/${alertId}/acknowledge`).set("Authorization", bearer(manager))).status).toBe(200);
    expect((await request(app).patch(`/api/alerts/${alertId}/acknowledge`).set("Authorization", bearer(manager))).status).toBe(409);
    expect(mocks.tx.alert.update).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows only administrators and managers to run checks manually", async () => {
    emptySchedulerSources();
    const owner = actor(Role.OWNER);
    mocks.prisma.user.findUnique.mockResolvedValue(owner);
    expect((await request(app).post("/api/alerts/run-scheduler").set("Authorization", bearer(owner))).status).toBe(403);
    const manager = actor(Role.MANAGER);
    mocks.prisma.user.findUnique.mockResolvedValue(manager);
    const allowed = await request(app).post("/api/alerts/run-scheduler").set("Authorization", bearer(manager));
    expect(allowed.status).toBe(200);
    expect(allowed.body.result).toMatchObject({ created: 0, existing: 0, resolved: 0 });
  });

  it("schedules and evaluates the daily run using the Asia/Colombo business clock", async () => {
    expect(millisecondsUntilNextRun(new Date("2026-11-09T18:00:00.000Z"))).toBe(90 * 60 * 1000);
    emptySchedulerSources();
    await runAlertScheduler(new Date("2026-11-09T19:45:00.000Z"));
    expect(mocks.tx.machine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ warrantyEnd: { not: null, lte: new Date("2026-11-17T00:00:00.000Z") } })
    }));
  });

  it("creates every due alert type and remains duplicate-free on a repeated run", async () => {
    const now = new Date("2026-11-09T15:00:00.000Z");
    mocks.tx.machine.findMany.mockResolvedValue([{ id: machineId, assetCode: "LAB-001", name: "Lathe", warrantyEnd: new Date("2026-11-16T00:00:00.000Z") }]);
    mocks.tx.machinePart.findMany.mockResolvedValue([{ id: "part-1", name: "Drive belt", warrantyEnd: new Date("2026-11-15T00:00:00.000Z"), replacementDue: new Date("2026-11-14T00:00:00.000Z"), machine: { id: machineId, assetCode: "LAB-001", name: "Lathe" } }]);
    mocks.tx.maintenancePlan.findMany.mockResolvedValue([{ id: "plan-1", title: "Monthly inspection", nextDueDate: new Date("2026-11-12T00:00:00.000Z"), thresholdDays: 3, machine: { id: machineId, assetCode: "LAB-001", name: "Lathe" } }]);
    mocks.tx.alert.findUnique.mockResolvedValue(null);
    mocks.tx.alert.create.mockImplementation(async ({ data }: { data: { dedupeKey: string } }) => ({ ...alert, id: data.dedupeKey, ...data }));
    mocks.tx.alert.findMany.mockResolvedValue([]);
    expect(await runAlertScheduler(now)).toMatchObject({ created: 4, existing: 0, resolved: 0 });
    expect(mocks.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.tx.$queryRaw.mock.calls[0][0].join(" ")).toContain('SELECT 1::int AS "locked"');
    const candidates = mocks.tx.alert.create.mock.calls.map(([call]) => call.data);
    mocks.tx.alert.findUnique.mockImplementation(async ({ where }: { where: { dedupeKey: string } }) => ({ ...alert, dedupeKey: where.dedupeKey, status: AlertStatus.OPEN }));
    mocks.tx.alert.findMany.mockResolvedValue(candidates.map((candidate) => ({ id: candidate.dedupeKey, dedupeKey: candidate.dedupeKey })));
    mocks.tx.alert.create.mockClear();
    expect(await runAlertScheduler(now)).toMatchObject({ created: 0, existing: 4, resolved: 0 });
    expect(mocks.tx.alert.create).not.toHaveBeenCalled();
  });

  it("does not create a far-future part alert when another date made the part query eligible", async () => {
    const now = new Date("2026-11-09T15:00:00.000Z");
    mocks.tx.machine.findMany.mockResolvedValue([]);
    mocks.tx.machinePart.findMany.mockResolvedValue([{ id: "part-1", name: "Drive belt", warrantyEnd: new Date("2027-11-09T00:00:00.000Z"), replacementDue: new Date("2026-11-16T00:00:00.000Z"), machine: { id: machineId, assetCode: "LAB-001", name: "Lathe" } }]);
    mocks.tx.maintenancePlan.findMany.mockResolvedValue([]);
    mocks.tx.alert.findUnique.mockResolvedValue(null);
    mocks.tx.alert.create.mockImplementation(async ({ data }: { data: { dedupeKey: string } }) => ({ ...alert, ...data }));
    mocks.tx.alert.findMany.mockResolvedValue([]);
    expect((await runAlertScheduler(now)).created).toBe(1);
    expect(mocks.tx.alert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: AlertType.PART_REPLACEMENT }) }));
  });

  it("resolves active alerts whose source is no longer within its threshold", async () => {
    const now = new Date("2026-11-09T15:00:00.000Z");
    emptySchedulerSources();
    mocks.tx.alert.findMany.mockResolvedValue([{ id: alertId, dedupeKey: alert.dedupeKey }]);
    mocks.tx.alert.update.mockResolvedValue({ ...alert, status: AlertStatus.RESOLVED, resolvedAt: now });
    expect((await runAlertScheduler(now)).resolved).toBe(1);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "ALERT_RESOLVED", entityId: alertId })
    }));
  });
});

