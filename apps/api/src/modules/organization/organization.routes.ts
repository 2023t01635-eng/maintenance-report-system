import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { withSerializableTransaction } from "../../lib/transactions.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { updateOrganizationProfileSchema } from "./organization.schemas.js";

const defaultProfile = {
  id: "primary",
  companyName: "University of Colombo - Faculty of Technology",
  address: null,
  registrationNumber: null,
  phone: null,
  email: null
};

export const organizationRouter = Router();
organizationRouter.use(requireAuth);

organizationRouter.get("/", async (_req, res) => {
  const profile = await prisma.organizationProfile.upsert({
    where: { id: "primary" },
    create: defaultProfile,
    update: {}
  });
  res.json({ profile });
});

organizationRouter.patch("/", requireRoles(Role.ADMIN), async (req, res) => {
  const input = updateOrganizationProfileSchema.parse(req.body);
  const actor = req.user!;
  const profile = await withSerializableTransaction(async (tx) => {
    const updated = await tx.organizationProfile.upsert({
      where: { id: "primary" },
      create: { id: "primary", ...input },
      update: input
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "ORGANIZATION_PROFILE_UPDATED",
        entityType: "OrganizationProfile",
        entityId: updated.id,
        details: { changedFields: Object.keys(input) } as Prisma.InputJsonValue,
        ipAddress: req.ip
      }
    });
    return updated;
  });
  res.json({ profile });
});
