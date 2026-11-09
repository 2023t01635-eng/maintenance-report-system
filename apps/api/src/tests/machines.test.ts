import { MachineStatus, MaintenanceFrequency, Role } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    machine: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn()
    },
    machinePart: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    maintenancePlan: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    auditLog: { create: vi.fn() }
  };

  const prisma = {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    machine: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    machinePart: { findMany: vi.fn() },
    maintenancePlan: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    alert: { count: vi.fn() },
    workOrder: { count: vi.fn() }
  };

  return { prisma, tx };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { app } from "../app.js";
import { createAuthToken } from "../modules/auth/auth.service.js";

const operatorId = "8c68bb03-773e-4cd9-8ea5-d8a8ccf07da1";
const machineId = "machine-1";
const partId = "part-1";
const planId = "plan-1";

function actor(role: Role, id = `${role.toLowerCase()}-1`) {
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

const machine = {
  id: machineId,
  assetCode: "LAB-001",
  name: "CNC Mill",
  category: "Manufacturing",
  location: "Lab A",
  manufacturer: null,
  model: null,
  serialNumber: null,
  warrantyStart: null,
  warrantyEnd: null,
  status: MachineStatus.ACTIVE,
  operatorId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  operator: null,
  _count: { parts: 0, plans: 0 }
};

const part = {
  id: partId,
  machineId,
  name: "Drive belt",
  partNumber: "DB-10",
  warrantyStart: null,
  warrantyEnd: null,
  replacementDue: null,
  quantity: 2,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const plan = {
  id: planId,
  machineId,
  title: "Monthly inspection",
  description: null,
  frequency: MaintenanceFrequency.MONTHLY,
  intervalDays: null,
  nextDueDate: new Date("2026-12-01T00:00:00.000Z"),
  thresholdDays: 7,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("Milestone 3 machine API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
    );
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("rejects unauthenticated asset requests", async () => {
    const response = await request(app).get("/api/machines");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
  });

  it("forbids service providers from machine and operator data", async () => {
    const user = actor(Role.SERVICE_PROVIDER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);

    const [machinesResponse, operatorsResponse] = await Promise.all([
      request(app).get("/api/machines").set("Authorization", bearer(user)),
      request(app).get("/api/operators").set("Authorization", bearer(user))
    ]);

    expect(machinesResponse.status).toBe(403);
    expect(operatorsResponse.status).toBe(403);
  });

  it("lists every machine for managers", async () => {
    const user = actor(Role.MANAGER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.machine.findMany.mockResolvedValue([machine]);

    const response = await request(app).get("/api/machines").set("Authorization", bearer(user));

    expect(response.status).toBe(200);
    expect(response.body.machines).toHaveLength(1);
    expect(mocks.prisma.machine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("limits operators to their assigned machines and hides unassigned details", async () => {
    const user = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.machine.findMany.mockResolvedValue([]);
    mocks.prisma.machine.findFirst.mockResolvedValue(null);

    const listResponse = await request(app).get("/api/machines").set("Authorization", bearer(user));
    const detailResponse = await request(app)
      .get(`/api/machines/${machineId}`)
      .set("Authorization", bearer(user));

    expect(listResponse.status).toBe(200);
    expect(mocks.prisma.machine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { operatorId } })
    );
    expect(mocks.prisma.machine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: machineId, operatorId } })
    );
    expect(detailResponse.status).toBe(404);
  });

  it("forbids machine operators from asset mutations", async () => {
    const user = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(user);

    const response = await request(app)
      .post("/api/machines")
      .set("Authorization", bearer(user))
      .send({ assetCode: "LAB-004", name: "Pump", category: "Utilities", location: "Plant room" });

    expect(response.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a machine and audit record atomically after validating its operator", async () => {
    const user = actor(Role.OWNER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.user.findFirst.mockResolvedValue({ id: operatorId });
    mocks.tx.machine.create.mockResolvedValue({ ...machine, operatorId });

    const response = await request(app)
      .post("/api/machines")
      .set("Authorization", bearer(user))
      .send({
        assetCode: " lab-001 ",
        name: "CNC Mill",
        category: "Manufacturing",
        location: "Lab A",
        operatorId
      });

    expect(response.status).toBe(201);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" }
    );
    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: operatorId, role: Role.MACHINE_OPERATOR, isActive: true } })
    );
    expect(mocks.tx.machine.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assetCode: "LAB-001", operatorId }) })
    );
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MACHINE_CREATED", entityId: machineId }) })
    );
  });

  it("rejects inactive or non-operator assignments before mutation", async () => {
    const user = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.user.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/machines")
      .set("Authorization", bearer(user))
      .send({ assetCode: "LAB-002", name: "Lathe", category: "Manufacturing", location: "Lab A", operatorId });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("active machine operator");
    expect(mocks.tx.machine.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("validates machine warranty dates before opening a transaction", async () => {
    const user = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(user);

    const response = await request(app)
      .post("/api/machines")
      .set("Authorization", bearer(user))
      .send({
        assetCode: "LAB-003",
        name: "Compressor",
        category: "Utilities",
        location: "Plant room",
        warrantyStart: "2026-12-31",
        warrantyEnd: "2026-01-01"
      });

    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("updates a machine and audits changed fields in one transaction", async () => {
    const user = actor(Role.MANAGER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.machine.findUnique.mockResolvedValue(machine);
    mocks.tx.machine.update.mockResolvedValue({ ...machine, location: "Lab B" });

    const response = await request(app)
      .patch(`/api/machines/${machineId}`)
      .set("Authorization", bearer(user))
      .send({ location: "Lab B" });

    expect(response.status).toBe(200);
    expect(mocks.tx.machine.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: machineId }, data: { location: "Lab B" } })
    );
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MACHINE_UPDATED", details: { changedFields: ["location"] } })
      })
    );
  });

  it("allows only administrators to delete machines", async () => {
    const manager = actor(Role.MANAGER);
    mocks.prisma.user.findUnique.mockResolvedValue(manager);

    const forbidden = await request(app)
      .delete(`/api/machines/${machineId}`)
      .set("Authorization", bearer(manager));

    expect(forbidden.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();

    const admin = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(admin);
    mocks.tx.machine.findUnique.mockResolvedValue({ id: machineId, assetCode: "LAB-001", _count: { parts: 2, plans: 1 } });
    mocks.tx.machine.delete.mockResolvedValue(machine);

    const deleted = await request(app)
      .delete(`/api/machines/${machineId}`)
      .set("Authorization", bearer(admin));

    expect(deleted.status).toBe(204);
    expect(mocks.tx.machine.delete).toHaveBeenCalledWith({ where: { id: machineId } });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MACHINE_DELETED", entityId: machineId }) })
    );
  });

  it("scopes operator part reads through the parent machine", async () => {
    const user = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.machine.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/machines/${machineId}/parts`)
      .set("Authorization", bearer(user));

    expect(response.status).toBe(404);
    expect(mocks.prisma.machine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: machineId, operatorId } })
    );
    expect(mocks.prisma.machinePart.findMany).not.toHaveBeenCalled();
  });

  it("rejects nested creation when the parent machine is missing", async () => {
    const user = actor(Role.OWNER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.machine.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/machines/${machineId}/parts`)
      .set("Authorization", bearer(user))
      .send({ name: "Filter", quantity: 1 });

    expect(response.status).toBe(404);
    expect(mocks.tx.machinePart.create).not.toHaveBeenCalled();
  });

  it("lists, creates, and deletes parts through the requested machine", async () => {
    const user = actor(Role.MANAGER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.machine.findFirst.mockResolvedValue({ id: machineId });
    mocks.prisma.machinePart.findMany.mockResolvedValue([part]);
    mocks.tx.machine.findFirst.mockResolvedValue({ id: machineId });
    mocks.tx.machinePart.create.mockResolvedValue(part);
    mocks.tx.machinePart.findFirst.mockResolvedValue(part);
    mocks.tx.machinePart.delete.mockResolvedValue(part);

    const listed = await request(app)
      .get(`/api/machines/${machineId}/parts`)
      .set("Authorization", bearer(user));
    const created = await request(app)
      .post(`/api/machines/${machineId}/parts`)
      .set("Authorization", bearer(user))
      .send({ name: "Drive belt", partNumber: "DB-10", quantity: 2 });
    const deleted = await request(app)
      .delete(`/api/machines/${machineId}/parts/${partId}`)
      .set("Authorization", bearer(user));

    expect(listed.status).toBe(200);
    expect(listed.body.parts).toHaveLength(1);
    expect(created.status).toBe(201);
    expect(mocks.tx.machinePart.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ machineId, name: "Drive belt", quantity: 2 }) })
    );
    expect(deleted.status).toBe(204);
    expect(mocks.tx.machinePart.delete).toHaveBeenCalledWith({ where: { id: partId } });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MACHINE_PART_DELETED", entityId: partId }) })
    );
  });

  it("prevents updating a part through the wrong parent", async () => {
    const user = actor(Role.MANAGER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.machinePart.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/machines/other-machine/parts/${partId}`)
      .set("Authorization", bearer(user))
      .send({ quantity: 4 });

    expect(response.status).toBe(404);
    expect(mocks.tx.machinePart.findFirst).toHaveBeenCalledWith({
      where: { id: partId, machineId: "other-machine" }
    });
    expect(mocks.tx.machinePart.update).not.toHaveBeenCalled();
  });

  it("updates and deletes nested records with the documented role policy", async () => {
    const manager = actor(Role.MANAGER);
    mocks.prisma.user.findUnique.mockResolvedValue(manager);
    mocks.tx.machinePart.findFirst.mockResolvedValue(part);
    mocks.tx.machinePart.update.mockResolvedValue({ ...part, quantity: 3 });
    mocks.tx.maintenancePlan.findFirst.mockResolvedValue(plan);
    mocks.tx.maintenancePlan.delete.mockResolvedValue(plan);

    const updated = await request(app)
      .patch(`/api/machines/${machineId}/parts/${partId}`)
      .set("Authorization", bearer(manager))
      .send({ quantity: 3 });
    const deleted = await request(app)
      .delete(`/api/machines/${machineId}/plans/${planId}`)
      .set("Authorization", bearer(manager));

    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(204);
    expect(mocks.tx.machinePart.update).toHaveBeenCalledWith({ where: { id: partId }, data: { quantity: 3 } });
    expect(mocks.tx.maintenancePlan.delete).toHaveBeenCalledWith({ where: { id: planId } });

    const owner = actor(Role.OWNER);
    mocks.prisma.user.findUnique.mockResolvedValue(owner);
    const ownerDelete = await request(app)
      .delete(`/api/machines/${machineId}/parts/${partId}`)
      .set("Authorization", bearer(owner));
    expect(ownerDelete.status).toBe(403);
  });

  it("validates custom plan intervals and parent-scoped plan updates", async () => {
    const user = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(user);

    const invalidCreate = await request(app)
      .post(`/api/machines/${machineId}/plans`)
      .set("Authorization", bearer(user))
      .send({ title: "Calibration", frequency: "CUSTOM", nextDueDate: "2026-12-01" });
    expect(invalidCreate.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();

    mocks.tx.maintenancePlan.findFirst.mockResolvedValue({ ...plan, frequency: MaintenanceFrequency.CUSTOM, intervalDays: 30 });
    const invalidUpdate = await request(app)
      .patch(`/api/machines/${machineId}/plans/${planId}`)
      .set("Authorization", bearer(user))
      .send({ intervalDays: null });
    expect(invalidUpdate.status).toBe(400);
    expect(mocks.tx.maintenancePlan.update).not.toHaveBeenCalled();
  });

  it("creates a valid maintenance plan with an atomic audit event", async () => {
    const user = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.machine.findFirst.mockResolvedValue({ id: machineId });
    mocks.tx.maintenancePlan.create.mockResolvedValue(plan);

    const response = await request(app)
      .post(`/api/machines/${machineId}/plans`)
      .set("Authorization", bearer(user))
      .send({ title: "Monthly inspection", frequency: "MONTHLY", nextDueDate: "2026-12-01", thresholdDays: 7 });

    expect(response.status).toBe(201);
    expect(mocks.tx.maintenancePlan.create).toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MAINTENANCE_PLAN_CREATED", entityId: planId }) })
    );
  });

  it("allows operators to create plans only for their assigned machines", async () => {
    const user = actor(Role.MACHINE_OPERATOR, operatorId);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.machine.findFirst
      .mockResolvedValueOnce({ id: machineId })
      .mockResolvedValueOnce(null);
    mocks.tx.maintenancePlan.create.mockResolvedValue(plan);

    const assigned = await request(app)
      .post(`/api/machines/${machineId}/plans`)
      .set("Authorization", bearer(user))
      .send({ title: "Monthly inspection", frequency: "MONTHLY", nextDueDate: "2026-12-01" });
    const unassigned = await request(app)
      .post("/api/machines/other-machine/plans")
      .set("Authorization", bearer(user))
      .send({ title: "Monthly inspection", frequency: "MONTHLY", nextDueDate: "2026-12-01" });

    expect(assigned.status).toBe(201);
    expect(unassigned.status).toBe(404);
    expect(mocks.tx.machine.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: machineId, operatorId },
      select: { id: true }
    });
    expect(mocks.tx.machine.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: "other-machine", operatorId },
      select: { id: true }
    });
    expect(mocks.tx.maintenancePlan.create).toHaveBeenCalledOnce();
  });

  it("accepts calendar dates only and rejects timestamps", async () => {
    const user = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(user);

    const machineResponse = await request(app)
      .post("/api/machines")
      .set("Authorization", bearer(user))
      .send({
        assetCode: "LAB-004",
        name: "Pump",
        category: "Utilities",
        location: "Plant room",
        warrantyEnd: "2026-12-01T18:00:00Z"
      });
    const planResponse = await request(app)
      .post(`/api/machines/${machineId}/plans`)
      .set("Authorization", bearer(user))
      .send({
        title: "Monthly inspection",
        frequency: "MONTHLY",
        nextDueDate: "2026-12-01T18:00:00Z"
      });

    expect(machineResponse.status).toBe(400);
    expect(planResponse.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("lists and updates a maintenance plan scoped to its parent", async () => {
    const user = actor(Role.OWNER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.machine.findFirst.mockResolvedValue({ id: machineId });
    mocks.prisma.maintenancePlan.findMany.mockResolvedValue([plan]);
    mocks.tx.maintenancePlan.findFirst.mockResolvedValue(plan);
    mocks.tx.maintenancePlan.update.mockResolvedValue({ ...plan, thresholdDays: 14 });

    const listed = await request(app)
      .get(`/api/machines/${machineId}/plans`)
      .set("Authorization", bearer(user));
    const updated = await request(app)
      .patch(`/api/machines/${machineId}/plans/${planId}`)
      .set("Authorization", bearer(user))
      .send({ thresholdDays: 14 });

    expect(listed.status).toBe(200);
    expect(listed.body.plans).toHaveLength(1);
    expect(updated.status).toBe(200);
    expect(mocks.tx.maintenancePlan.findFirst).toHaveBeenCalledWith({ where: { id: planId, machineId } });
    expect(mocks.tx.maintenancePlan.update).toHaveBeenCalledWith({
      where: { id: planId },
      data: { thresholdDays: 14 }
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MAINTENANCE_PLAN_UPDATED", entityId: planId }) })
    );
  });

  it("prevents updating a maintenance plan through the wrong parent", async () => {
    const user = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.maintenancePlan.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/machines/other-machine/plans/${planId}`)
      .set("Authorization", bearer(user))
      .send({ thresholdDays: 3 });

    expect(response.status).toBe(404);
    expect(mocks.tx.maintenancePlan.findFirst).toHaveBeenCalledWith({
      where: { id: planId, machineId: "other-machine" }
    });
    expect(mocks.tx.maintenancePlan.update).not.toHaveBeenCalled();
  });

  it("returns only active machine operators to assigning roles", async () => {
    const user = actor(Role.OWNER);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.user.findMany.mockResolvedValue([{ id: operatorId, name: "Operator", email: "operator@example.com" }]);

    const response = await request(app).get("/api/operators").set("Authorization", bearer(user));

    expect(response.status).toBe(200);
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: Role.MACHINE_OPERATOR, isActive: true } })
    );
  });

  it("fails the request when the transactional audit write fails", async () => {
    const user = actor(Role.ADMIN);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.tx.machine.findUnique.mockResolvedValue(machine);
    mocks.tx.machine.update.mockResolvedValue({ ...machine, location: "Lab C" });
    mocks.tx.auditLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await request(app)
      .patch(`/api/machines/${machineId}`)
      .set("Authorization", bearer(user))
      .send({ location: "Lab C" });

    expect(response.status).toBe(500);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.machine.update).toHaveBeenCalledBefore(mocks.tx.auditLog.create);
  });
});
