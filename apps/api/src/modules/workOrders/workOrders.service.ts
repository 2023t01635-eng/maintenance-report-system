import { Prisma, Role, WorkOrderStatus } from "@prisma/client";
import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../lib/prisma.js";
import { withSerializableTransaction } from "../../lib/transactions.js";
import type { AuthUser } from "../auth/auth.types.js";
import type {
  CreateEvidenceInput,
  CreateWorkOrderInput,
  UpdateServiceDetailsInput,
  UpdateWorkOrderInput
} from "./workOrders.schemas.js";

export const workOrderManagementRoles = [Role.ADMIN, Role.OWNER, Role.MANAGER] as const;
export const workOrderReadRoles = [...workOrderManagementRoles, Role.MACHINE_OPERATOR, Role.SERVICE_PROVIDER] as const;

const providerVisibleStatuses: WorkOrderStatus[] = [
  WorkOrderStatus.APPROVED,
  WorkOrderStatus.SENT_TO_PROVIDER,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.COMPLETED
];

const providerEvidenceStatuses: WorkOrderStatus[] = [
  WorkOrderStatus.SENT_TO_PROVIDER,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.COMPLETED
];

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true
} satisfies Prisma.UserSelect;

const workOrderInclude = {
  machine: {
    select: {
      id: true,
      assetCode: true,
      name: true,
      location: true,
      operatorId: true,
      operator: { select: userSelect }
    }
  },
  provider: { select: userSelect },
  approvedByOperator: { select: userSelect },
  evidence: { orderBy: { createdAt: "desc" as const } }
} satisfies Prisma.WorkOrderInclude;

function visibleWorkOrderWhere(user: AuthUser, id?: string): Prisma.WorkOrderWhereInput {
  const identity = id ? { id } : {};

  if (user.role === Role.MACHINE_OPERATOR) {
    return { ...identity, machine: { operatorId: user.id } };
  }

  if (user.role === Role.SERVICE_PROVIDER) {
    return { ...identity, providerId: user.id, status: { in: providerVisibleStatuses } };
  }

  return identity;
}

function auditData(
  actor: AuthUser,
  action: string,
  entityId: string,
  details: Prisma.InputJsonValue,
  ipAddress?: string
): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorId: actor.id,
    action,
    entityType: "WorkOrder",
    entityId,
    details,
    ipAddress
  };
}

function draftData(input: CreateWorkOrderInput | UpdateWorkOrderInput) {
  return {
    ...(input.machineId !== undefined ? { machineId: input.machineId } : {}),
    ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.scheduledDate !== undefined ? { scheduledDate: input.scheduledDate } : {}),
    ...(input.cost !== undefined ? { cost: input.cost } : {}),
    ...(input.replacedParts !== undefined ? { replacedParts: input.replacedParts } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {})
  };
}

function assertStatus(current: WorkOrderStatus, expected: WorkOrderStatus) {
  if (current !== expected) {
    throw new HttpError(409, `Work order must be ${expected} for this transition`);
  }
}

async function assertMachineExists(tx: Prisma.TransactionClient, machineId: string) {
  const machine = await tx.machine.findUnique({ where: { id: machineId }, select: { id: true } });
  if (!machine) {
    throw new HttpError(400, "Selected machine does not exist");
  }
}

async function assertActiveProvider(tx: Prisma.TransactionClient, providerId: string) {
  const provider = await tx.user.findFirst({
    where: { id: providerId, role: Role.SERVICE_PROVIDER, isActive: true },
    select: { id: true }
  });
  if (!provider) {
    throw new HttpError(400, "Selected provider must be an active service provider");
  }
}

async function loadWorkOrder(tx: Prisma.TransactionClient, id: string) {
  const workOrder = await tx.workOrder.findUnique({ where: { id }, include: workOrderInclude });
  if (!workOrder) {
    throw new HttpError(404, "Work order not found");
  }
  return workOrder;
}

async function updateStatus(
  tx: Prisma.TransactionClient,
  id: string,
  status: WorkOrderStatus,
  data: Prisma.WorkOrderUncheckedUpdateInput = {}
) {
  return tx.workOrder.update({
    where: { id },
    data: { ...data, status },
    include: workOrderInclude
  });
}

export async function listWorkOrders(user: AuthUser) {
  return prisma.workOrder.findMany({
    where: visibleWorkOrderWhere(user),
    include: workOrderInclude,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function getWorkOrder(id: string, user: AuthUser) {
  const workOrder = await prisma.workOrder.findFirst({
    where: visibleWorkOrderWhere(user, id),
    include: workOrderInclude
  });
  if (!workOrder) {
    throw new HttpError(404, "Work order not found");
  }
  return workOrder;
}

export async function listActiveProviders() {
  return prisma.user.findMany({
    where: { role: Role.SERVICE_PROVIDER, isActive: true },
    select: userSelect,
    orderBy: { name: "asc" }
  });
}

export async function createWorkOrder(input: CreateWorkOrderInput, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    await assertMachineExists(tx, input.machineId);
    if (input.providerId) {
      await assertActiveProvider(tx, input.providerId);
    }

    const workOrder = await tx.workOrder.create({
      data: draftData(input) as Prisma.WorkOrderUncheckedCreateInput,
      include: workOrderInclude
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_CREATED", workOrder.id, { machineId: input.machineId }, ipAddress)
    });
    return workOrder;
  });
}

export async function updateWorkOrder(
  id: string,
  input: UpdateWorkOrderInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertStatus(current.status, WorkOrderStatus.DRAFT);

    if (input.machineId !== undefined) {
      await assertMachineExists(tx, input.machineId);
    }
    if (input.providerId) {
      await assertActiveProvider(tx, input.providerId);
    }

    const workOrder = await tx.workOrder.update({
      where: { id },
      data: draftData(input) as Prisma.WorkOrderUncheckedUpdateInput,
      include: workOrderInclude
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_UPDATED", id, { changedFields: Object.keys(input) }, ipAddress)
    });
    return workOrder;
  });
}

export async function submitWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertStatus(current.status, WorkOrderStatus.DRAFT);

    const operator = current.machine.operator;
    if (!operator || operator.role !== Role.MACHINE_OPERATOR || !operator.isActive) {
      throw new HttpError(400, "Machine must have an active assigned operator before submission");
    }

    const workOrder = await updateStatus(tx, id, WorkOrderStatus.PENDING_OPERATOR_APPROVAL);
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_SUBMITTED", id, { operatorId: operator.id }, ipAddress)
    });
    return workOrder;
  });
}

export async function approveWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    if (current.machine.operatorId !== actor.id) {
      throw new HttpError(403, "Only the assigned machine operator may approve this work order");
    }
    assertStatus(current.status, WorkOrderStatus.PENDING_OPERATOR_APPROVAL);

    const workOrder = await updateStatus(tx, id, WorkOrderStatus.APPROVED, {
      approvedByOperatorId: actor.id
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_APPROVED", id, { approvedByOperatorId: actor.id }, ipAddress)
    });
    return workOrder;
  });
}

export async function sendWorkOrderToProvider(
  id: string,
  providerId: string,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertStatus(current.status, WorkOrderStatus.APPROVED);
    await assertActiveProvider(tx, providerId);

    const workOrder = await updateStatus(tx, id, WorkOrderStatus.SENT_TO_PROVIDER, { providerId });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_SENT_TO_PROVIDER", id, { providerId }, ipAddress)
    });
    return workOrder;
  });
}

export async function startWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    if (current.providerId !== actor.id) {
      throw new HttpError(403, "Only the assigned service provider may start this work order");
    }
    assertStatus(current.status, WorkOrderStatus.SENT_TO_PROVIDER);

    const workOrder = await updateStatus(tx, id, WorkOrderStatus.IN_PROGRESS);
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_STARTED", id, { providerId: actor.id }, ipAddress)
    });
    return workOrder;
  });
}

export async function completeWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    if (current.providerId !== actor.id) {
      throw new HttpError(403, "Only the assigned service provider may complete this work order");
    }
    assertStatus(current.status, WorkOrderStatus.IN_PROGRESS);

    const completedDate = current.completedDate ?? new Date();
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.COMPLETED, { completedDate });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_COMPLETED", id, { providerId: actor.id, completedDate: completedDate.toISOString() }, ipAddress)
    });
    return workOrder;
  });
}

export async function updateServiceDetails(
  id: string,
  input: UpdateServiceDetailsInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    if (actor.role === Role.SERVICE_PROVIDER && current.providerId !== actor.id) {
      throw new HttpError(403, "Only the assigned service provider may update service details");
    }
    const editableStatuses: WorkOrderStatus[] = [WorkOrderStatus.SENT_TO_PROVIDER, WorkOrderStatus.IN_PROGRESS];
    if (!editableStatuses.includes(current.status)) {
      throw new HttpError(409, "Service details can only be updated after sending and before completion");
    }

    const workOrder = await tx.workOrder.update({
      where: { id },
      data: {
        ...(input.completedDate !== undefined ? { completedDate: input.completedDate } : {}),
        ...(input.cost !== undefined ? { cost: input.cost } : {}),
        ...(input.replacedParts !== undefined ? { replacedParts: input.replacedParts } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {})
      } as Prisma.WorkOrderUncheckedUpdateInput,
      include: workOrderInclude
    });
    await tx.auditLog.create({
      data: auditData(
        actor,
        "WORK_ORDER_SERVICE_DETAILS_UPDATED",
        id,
        { changedFields: Object.keys(input) },
        ipAddress
      )
    });
    return workOrder;
  });
}

export async function cancelWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    const terminalStatuses: WorkOrderStatus[] = [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED];
    if (terminalStatuses.includes(current.status)) {
      throw new HttpError(409, "Completed or cancelled work orders cannot be cancelled");
    }

    const workOrder = await updateStatus(tx, id, WorkOrderStatus.CANCELLED);
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_CANCELLED", id, { previousStatus: current.status }, ipAddress)
    });
    return workOrder;
  });
}

export async function addServiceEvidence(
  id: string,
  input: CreateEvidenceInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);

    if (
      actor.role !== Role.SERVICE_PROVIDER ||
      current.providerId !== actor.id ||
      !providerEvidenceStatuses.includes(current.status)
    ) {
      throw new HttpError(403, "You do not have permission to add evidence to this work order");
    }

    const evidence = await tx.serviceEvidence.create({
      data: { workOrderId: id, ...input }
    });
    await tx.auditLog.create({
      data: auditData(
        actor,
        "SERVICE_EVIDENCE_ADDED",
        id,
        { evidenceId: evidence.id, type: evidence.type, fileName: evidence.fileName },
        ipAddress
      )
    });
    return evidence;
  });
}
