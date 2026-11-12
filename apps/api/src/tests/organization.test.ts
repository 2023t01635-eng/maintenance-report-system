import { Role } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    organizationProfile: { upsert: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  const prisma = {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn() },
    organizationProfile: { upsert: vi.fn() }
  };
  return { prisma, tx };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { app } from "../app.js";
import { createAuthToken } from "../modules/auth/auth.service.js";

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

const profile = {
  id: "primary",
  companyName: "University of Colombo - Faculty of Technology",
  address: "Pitipana, Homagama",
  registrationNumber: "UOC-FOT",
  phone: "+94 11 275 8000",
  email: "technology@cmb.ac.lk",
  createdAt: new Date("2026-11-11T00:00:00.000Z"),
  updatedAt: new Date("2026-11-11T00:00:00.000Z")
};

describe("organization receipt identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
    );
  });

  it("allows every authenticated role to read the receipt identity", async () => {
    const provider = actor(Role.SERVICE_PROVIDER);
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    mocks.prisma.organizationProfile.upsert.mockResolvedValue(profile);

    const response = await request(app)
      .get("/api/organization-profile")
      .set("Authorization", bearer(provider));

    expect(response.status).toBe(200);
    expect(response.body.profile.companyName).toBe(profile.companyName);
  });

  it("restricts updates to administrators and records an audit event", async () => {
    const provider = actor(Role.SERVICE_PROVIDER);
    mocks.prisma.user.findUnique.mockResolvedValue(provider);
    expect((await request(app)
      .patch("/api/organization-profile")
      .set("Authorization", bearer(provider))
      .send({ companyName: "Blocked" })).status).toBe(403);

    const admin = actor(Role.ADMIN, "admin-1");
    mocks.prisma.user.findUnique.mockResolvedValue(admin);
    mocks.tx.organizationProfile.upsert.mockResolvedValue(profile);
    mocks.tx.auditLog.create.mockResolvedValue({});

    const response = await request(app)
      .patch("/api/organization-profile")
      .set("Authorization", bearer(admin))
      .send({
        companyName: profile.companyName,
        address: profile.address,
        registrationNumber: profile.registrationNumber,
        phone: profile.phone,
        email: profile.email
      });

    expect(response.status).toBe(200);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorId: admin.id,
        action: "ORGANIZATION_PROFILE_UPDATED"
      })
    }));
  });
});
