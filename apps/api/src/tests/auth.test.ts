import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    auditLog: { create: vi.fn() },
    machine: { count: vi.fn() },
    alert: { count: vi.fn() },
    workOrder: { count: vi.fn() }
  }
}));

import { app } from "../app.js";
import { prisma } from "../lib/prisma.js";

const admin = {
  id: "admin-1",
  name: "System Administrator",
  email: "admin@example.com",
  passwordHash: bcrypt.hashSync("Admin@12345", 4),
  role: Role.ADMIN,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("authentication and access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("reports when first-time setup is required", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0);

    const response = await request(app).get("/api/auth/setup-status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ needsSetup: true });
  });

  it("creates the first administrator with a hashed password", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.user.create).mockResolvedValue(admin);

    const response = await request(app).post("/api/auth/setup-admin").send({
      name: admin.name,
      email: admin.email,
      password: "Admin@12345"
    });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("ADMIN");
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: expect.not.stringMatching(/^Admin@12345$/) })
      })
    );
    expect(response.headers["set-cookie"][0]).toContain("mrs_session=");
  });

  it("rejects an invalid login without revealing account details", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await request(app).post("/api/auth/login").send({
      email: "missing@example.com",
      password: "WrongPassword"
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("enforces administrator-only user management", async () => {
    const owner = { ...admin, id: "owner-1", email: "owner@example.com", role: Role.OWNER };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(owner);

    const login = await request(app).post("/api/auth/login").send({
      email: owner.email,
      password: "Admin@12345"
    });
    const cookie = login.headers["set-cookie"];
    const response = await request(app).get("/api/users").set("Cookie", cookie);

    expect(login.status).toBe(200);
    expect(response.status).toBe(403);
  });
});
