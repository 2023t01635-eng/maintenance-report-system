import { Role } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    user: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    machine: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  const prisma = {
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    auditLog: { create: vi.fn() },
    machine: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    machinePart: { findMany: vi.fn() },
    maintenancePlan: { findMany: vi.fn() },
    alert: { count: vi.fn() },
    workOrder: { count: vi.fn() }
  };
  return { prisma, tx };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { app } from "../app.js";
import { createAuthToken } from "../modules/auth/auth.service.js";

const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.com",
  passwordHash: "hash",
  role: Role.ADMIN,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const operator = {
  ...admin,
  id: "operator-1",
  name: "Machine Operator",
  email: "operator@example.com",
  role: Role.MACHINE_OPERATOR
};

describe("operator assignment cleanup during user administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue(admin);
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
    );
    mocks.tx.user.findUnique.mockResolvedValue(operator);
    mocks.tx.user.update.mockResolvedValue({ ...operator, isActive: false });
    mocks.tx.machine.updateMany.mockResolvedValue({ count: 3 });
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("atomically unassigns every machine when an operator is deactivated", async () => {
    const response = await request(app)
      .patch(`/api/users/${operator.id}`)
      .set("Authorization", `Bearer ${createAuthToken(admin)}`)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" }
    );
    expect(mocks.tx.machine.updateMany).toHaveBeenCalledWith({
      where: { operatorId: operator.id },
      data: { operatorId: null }
    });
    expect(mocks.tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: operator.id }, data: expect.objectContaining({ isActive: false }) })
    );
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "USER_UPDATED",
          details: { changedFields: ["isActive"], unassignedMachineCount: 3 }
        })
      })
    );
  });

  it("creates a user and its audit event in one transaction", async () => {
    const created = { ...operator, id: "operator-2", email: "new.operator@example.com" };
    mocks.tx.user.create.mockResolvedValue(created);

    const response = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${createAuthToken(admin)}`)
      .send({
        name: created.name,
        email: created.email,
        password: "Operator@12345",
        role: Role.MACHINE_OPERATOR
      });

    expect(response.status).toBe(201);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: created.email, role: Role.MACHINE_OPERATOR }) })
    );
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "USER_CREATED", entityId: created.id }) })
    );
  });

  it("unassigns machines when an operator moves to another role", async () => {
    mocks.tx.user.update.mockResolvedValue({ ...operator, role: Role.MANAGER });

    const response = await request(app)
      .patch(`/api/users/${operator.id}`)
      .set("Authorization", `Bearer ${createAuthToken(admin)}`)
      .send({ role: Role.MANAGER });

    expect(response.status).toBe(200);
    expect(mocks.tx.machine.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: Role.MANAGER }) })
    );
  });

  it("does not clear assignments for ordinary operator profile edits", async () => {
    mocks.tx.user.update.mockResolvedValue({ ...operator, name: "Updated Operator" });

    const response = await request(app)
      .patch(`/api/users/${operator.id}`)
      .set("Authorization", `Bearer ${createAuthToken(admin)}`)
      .send({ name: "Updated Operator" });

    expect(response.status).toBe(200);
    expect(mocks.tx.machine.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: { changedFields: ["name"], unassignedMachineCount: 0 }
        })
      })
    );
  });

  it("fails the user update transaction if its audit write fails", async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await request(app)
      .patch(`/api/users/${operator.id}`)
      .set("Authorization", `Bearer ${createAuthToken(admin)}`)
      .send({ isActive: false });

    expect(response.status).toBe(500);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.user.update).toHaveBeenCalledBefore(mocks.tx.auditLog.create);
  });

  it("retries a serializable write conflict", async () => {
    mocks.prisma.$transaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(
        async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
      );

    const response = await request(app)
      .patch(`/api/users/${operator.id}`)
      .set("Authorization", `Bearer ${createAuthToken(admin)}`)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
