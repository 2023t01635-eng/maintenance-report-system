import { MaintenanceFrequency, Prisma, Role } from "@prisma/client";
import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../lib/prisma.js";
import { withSerializableTransaction } from "../../lib/transactions.js";
import type { AuthUser } from "../auth/auth.types.js";
import type {
  CreateMachineInput,
  CreateMachinePartInput,
  CreateMaintenancePlanInput,
  UpdateMachineInput,
  UpdateMachinePartInput,
  UpdateMaintenancePlanInput
} from "./machines.schemas.js";

export const machineReadRoles = [Role.ADMIN, Role.OWNER, Role.MANAGER, Role.MACHINE_OPERATOR];
export const machineWriteRoles = [Role.ADMIN, Role.OWNER, Role.MANAGER];
export const maintenancePlanWriteRoles = [...machineWriteRoles, Role.MACHINE_OPERATOR];
export const nestedDeleteRoles = [Role.ADMIN, Role.MANAGER];

const operatorSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true
} satisfies Prisma.UserSelect;

const machineSummaryInclude = {
  operator: { select: operatorSelect },
  _count: { select: { parts: true, plans: true } }
} satisfies Prisma.MachineInclude;

const machineDetailInclude = {
  operator: { select: operatorSelect },
  parts: { orderBy: { name: "asc" } },
  plans: { orderBy: [{ isActive: "desc" }, { nextDueDate: "asc" }] }
} satisfies Prisma.MachineInclude;

function visibleMachineWhere(user: AuthUser, id?: string): Prisma.MachineWhereInput {
  return {
    ...(id ? { id } : {}),
    ...(user.role === Role.MACHINE_OPERATOR ? { operatorId: user.id } : {})
  };
}

function assertDateRange(start: Date | null | undefined, end: Date | null | undefined) {
  if (start && end && end < start) {
    throw new HttpError(400, "Warranty end date must be on or after the start date");
  }
}

function assertPlanFrequency(frequency: MaintenanceFrequency, intervalDays: number | null | undefined) {
  if (frequency === MaintenanceFrequency.CUSTOM && intervalDays == null) {
    throw new HttpError(400, "intervalDays is required for custom frequency");
  }
}

async function assertAssignableOperator(tx: Prisma.TransactionClient, operatorId: string | null | undefined) {
  if (!operatorId) {
    return;
  }

  const operator = await tx.user.findFirst({
    where: { id: operatorId, role: Role.MACHINE_OPERATOR, isActive: true },
    select: { id: true }
  });

  if (!operator) {
    throw new HttpError(400, "Selected operator must be an active machine operator");
  }
}

function machineData(input: CreateMachineInput | UpdateMachineInput): Prisma.MachineUncheckedCreateInput {
  return {
    ...(input.assetCode !== undefined ? { assetCode: input.assetCode } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.manufacturer !== undefined ? { manufacturer: input.manufacturer } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber } : {}),
    ...(input.warrantyStart !== undefined ? { warrantyStart: input.warrantyStart } : {}),
    ...(input.warrantyEnd !== undefined ? { warrantyEnd: input.warrantyEnd } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.operatorId !== undefined ? { operatorId: input.operatorId } : {})
  } as Prisma.MachineUncheckedCreateInput;
}

function partData(input: CreateMachinePartInput | UpdateMachinePartInput): Prisma.MachinePartUncheckedUpdateInput {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.partNumber !== undefined ? { partNumber: input.partNumber } : {}),
    ...(input.warrantyStart !== undefined ? { warrantyStart: input.warrantyStart } : {}),
    ...(input.warrantyEnd !== undefined ? { warrantyEnd: input.warrantyEnd } : {}),
    ...(input.replacementDue !== undefined ? { replacementDue: input.replacementDue } : {}),
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {})
  };
}

function planData(input: CreateMaintenancePlanInput | UpdateMaintenancePlanInput): Prisma.MaintenancePlanUncheckedUpdateInput {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
    ...(input.intervalDays !== undefined ? { intervalDays: input.intervalDays } : {}),
    ...(input.nextDueDate !== undefined ? { nextDueDate: input.nextDueDate } : {}),
    ...(input.thresholdDays !== undefined ? { thresholdDays: input.thresholdDays } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
  };
}

function auditData(
  actor: AuthUser,
  action: string,
  entityType: string,
  entityId: string,
  details: Prisma.InputJsonValue,
  ipAddress?: string
): Prisma.AuditLogUncheckedCreateInput {
  return { actorId: actor.id, action, entityType, entityId, details, ipAddress };
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function listMachines(user: AuthUser) {
  return prisma.machine.findMany({
    where: visibleMachineWhere(user),
    include: machineSummaryInclude,
    orderBy: [{ status: "asc" }, { assetCode: "asc" }]
  });
}

export async function getMachine(user: AuthUser, id: string) {
  const machine = await prisma.machine.findFirst({
    where: visibleMachineWhere(user, id),
    include: machineDetailInclude
  });

  if (!machine) {
    throw new HttpError(404, "Machine not found");
  }

  return machine;
}

export async function createMachine(input: CreateMachineInput, actor: AuthUser, ipAddress?: string) {
  assertDateRange(input.warrantyStart, input.warrantyEnd);

  return withSerializableTransaction(async (tx) => {
    await assertAssignableOperator(tx, input.operatorId);
    const machine = await tx.machine.create({
      data: machineData(input),
      include: machineSummaryInclude
    });
    await tx.auditLog.create({
      data: auditData(actor, "MACHINE_CREATED", "Machine", machine.id, { assetCode: machine.assetCode }, ipAddress)
    });
    return machine;
  });
}

export async function updateMachine(id: string, input: UpdateMachineInput, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await tx.machine.findUnique({ where: { id } });
    if (!current) {
      throw new HttpError(404, "Machine not found");
    }

    const warrantyStart = input.warrantyStart === undefined ? current.warrantyStart : input.warrantyStart;
    const warrantyEnd = input.warrantyEnd === undefined ? current.warrantyEnd : input.warrantyEnd;
    assertDateRange(warrantyStart, warrantyEnd);
    if (input.operatorId !== undefined) {
      await assertAssignableOperator(tx, input.operatorId);
    }

    const machine = await tx.machine.update({
      where: { id },
      data: machineData(input),
      include: machineSummaryInclude
    });
    await tx.auditLog.create({
      data: auditData(actor, "MACHINE_UPDATED", "Machine", id, { changedFields: Object.keys(input) }, ipAddress)
    });
    return machine;
  });
}

export async function deleteMachine(id: string, actor: AuthUser, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.machine.findUnique({
      where: { id },
      select: { id: true, assetCode: true, _count: { select: { parts: true, plans: true } } }
    });
    if (!current) {
      throw new HttpError(404, "Machine not found");
    }

    await tx.machine.delete({ where: { id } });
    await tx.auditLog.create({
      data: auditData(
        actor,
        "MACHINE_DELETED",
        "Machine",
        id,
        { assetCode: current.assetCode, deletedParts: current._count.parts, deletedPlans: current._count.plans },
        ipAddress
      )
    });
  });
}

async function assertVisibleMachine(user: AuthUser, machineId: string) {
  const machine = await prisma.machine.findFirst({
    where: visibleMachineWhere(user, machineId),
    select: { id: true }
  });
  if (!machine) {
    throw new HttpError(404, "Machine not found");
  }
}

export async function listMachineParts(machineId: string, user: AuthUser) {
  await assertVisibleMachine(user, machineId);
  return prisma.machinePart.findMany({ where: { machineId }, orderBy: { name: "asc" } });
}

export async function createMachinePart(
  machineId: string,
  input: CreateMachinePartInput,
  actor: AuthUser,
  ipAddress?: string
) {
  assertDateRange(input.warrantyStart, input.warrantyEnd);
  return prisma.$transaction(async (tx) => {
    if (!(await tx.machine.findFirst({ where: visibleMachineWhere(actor, machineId), select: { id: true } }))) {
      throw new HttpError(404, "Machine not found");
    }
    const part = await tx.machinePart.create({ data: { machineId, ...partData(input) } as Prisma.MachinePartUncheckedCreateInput });
    await tx.auditLog.create({
      data: auditData(actor, "MACHINE_PART_CREATED", "MachinePart", part.id, { machineId }, ipAddress)
    });
    return part;
  });
}

export async function updateMachinePart(
  machineId: string,
  partId: string,
  input: UpdateMachinePartInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.machinePart.findFirst({ where: { id: partId, machineId } });
    if (!current) {
      throw new HttpError(404, "Machine part not found");
    }
    const warrantyStart = input.warrantyStart === undefined ? current.warrantyStart : input.warrantyStart;
    const warrantyEnd = input.warrantyEnd === undefined ? current.warrantyEnd : input.warrantyEnd;
    assertDateRange(warrantyStart, warrantyEnd);
    const part = await tx.machinePart.update({ where: { id: partId }, data: partData(input) });
    await tx.auditLog.create({
      data: auditData(actor, "MACHINE_PART_UPDATED", "MachinePart", partId, { machineId, changedFields: Object.keys(input) }, ipAddress)
    });
    return part;
  });
}

export async function deleteMachinePart(machineId: string, partId: string, actor: AuthUser, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.machinePart.findFirst({ where: { id: partId, machineId } });
    if (!current) {
      throw new HttpError(404, "Machine part not found");
    }
    await tx.machinePart.delete({ where: { id: partId } });
    await tx.auditLog.create({
      data: auditData(actor, "MACHINE_PART_DELETED", "MachinePart", partId, { machineId, name: current.name }, ipAddress)
    });
  });
}

export async function listMaintenancePlans(machineId: string, user: AuthUser) {
  await assertVisibleMachine(user, machineId);
  return prisma.maintenancePlan.findMany({
    where: { machineId },
    orderBy: [{ isActive: "desc" }, { nextDueDate: "asc" }]
  });
}

export async function createMaintenancePlan(
  machineId: string,
  input: CreateMaintenancePlanInput,
  actor: AuthUser,
  ipAddress?: string
) {
  assertPlanFrequency(input.frequency, input.intervalDays);
  return prisma.$transaction(async (tx) => {
    if (!(await tx.machine.findFirst({ where: visibleMachineWhere(actor, machineId), select: { id: true } }))) {
      throw new HttpError(404, "Machine not found");
    }
    const plan = await tx.maintenancePlan.create({
      data: { machineId, ...planData(input) } as Prisma.MaintenancePlanUncheckedCreateInput
    });
    await tx.auditLog.create({
      data: auditData(actor, "MAINTENANCE_PLAN_CREATED", "MaintenancePlan", plan.id, { machineId }, ipAddress)
    });
    return plan;
  });
}

export async function updateMaintenancePlan(
  machineId: string,
  planId: string,
  input: UpdateMaintenancePlanInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.maintenancePlan.findFirst({
      where: {
        id: planId,
        machineId,
        ...(actor.role === Role.MACHINE_OPERATOR ? { machine: { operatorId: actor.id } } : {})
      }
    });
    if (!current) {
      throw new HttpError(404, "Maintenance plan not found");
    }
    const frequency = input.frequency ?? current.frequency;
    const intervalDays = input.intervalDays === undefined ? current.intervalDays : input.intervalDays;
    assertPlanFrequency(frequency, intervalDays);
    const plan = await tx.maintenancePlan.update({ where: { id: planId }, data: planData(input) });
    await tx.auditLog.create({
      data: auditData(actor, "MAINTENANCE_PLAN_UPDATED", "MaintenancePlan", planId, { machineId, changedFields: Object.keys(input) }, ipAddress)
    });
    return plan;
  });
}

export async function deleteMaintenancePlan(machineId: string, planId: string, actor: AuthUser, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.maintenancePlan.findFirst({ where: { id: planId, machineId } });
    if (!current) {
      throw new HttpError(404, "Maintenance plan not found");
    }
    await tx.maintenancePlan.delete({ where: { id: planId } });
    await tx.auditLog.create({
      data: auditData(actor, "MAINTENANCE_PLAN_DELETED", "MaintenancePlan", planId, { machineId, title: current.title }, ipAddress)
    });
  });
}
