import { AlertStatus, AlertType, Prisma, Role, WorkOrderStatus } from "@prisma/client";
import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../lib/prisma.js";
import { withSerializableTransaction } from "../../lib/transactions.js";
import type { AuthUser } from "../auth/auth.types.js";
import type {
  ApproveAndDispatchInput,
  ApprovePaymentInput,
  CounterPaymentInput,
  CreateEvidenceInput,
  CreateReplacementInput,
  CreateWorkOrderInput,
  RejectWorkOrderInput,
  UpdateServiceDetailsInput,
  UpdateReplacementInput,
  UpdateWorkOrderInput
} from "./workOrders.schemas.js";

export const workOrderManagementRoles = [Role.ADMIN, Role.OWNER, Role.MANAGER] as const;
export const workOrderCounterRoles = [Role.OWNER, Role.MANAGER] as const;
export const workOrderCreateRoles = [...workOrderManagementRoles, Role.MACHINE_OPERATOR] as const;
export const workOrderReadRoles = [...workOrderCreateRoles, Role.SERVICE_PROVIDER] as const;

const providerVisibleStatuses: WorkOrderStatus[] = [
  WorkOrderStatus.SENT_TO_PROVIDER,
  WorkOrderStatus.PROVIDER_ACCEPTED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PRICE_REVISION_REQUESTED,
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.AWAITING_PAYMENT_APPROVAL,
  WorkOrderStatus.CLOSED
];
const providerEditableStatuses: WorkOrderStatus[] = [
  WorkOrderStatus.PROVIDER_ACCEPTED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PRICE_REVISION_REQUESTED
];
const providerEvidenceStatuses: WorkOrderStatus[] = [...providerEditableStatuses, WorkOrderStatus.AWAITING_PAYMENT_APPROVAL];
const terminalStatuses: WorkOrderStatus[] = [
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.REJECTED,
  WorkOrderStatus.CANCELLED
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
      category: true,
      location: true,
      status: true,
      operatorId: true,
      operator: { select: userSelect },
      parts: {
        select: {
          id: true,
          machineId: true,
          name: true,
          partNumber: true,
          warrantyStart: true,
          warrantyEnd: true,
          replacementDue: true,
          quantity: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { name: "asc" as const }
      }
    }
  },
  provider: { select: userSelect },
  approvedByOperator: { select: userSelect },
  createdBy: { select: userSelect },
  managementApprovedBy: { select: userSelect },
  paymentApprovedBy: { select: userSelect },
  sourceAlert: {
    select: { id: true, type: true, status: true, dueDate: true, message: true, partId: true, planId: true }
  },
  replacements: { orderBy: { createdAt: "asc" as const } },
  evidence: {
    include: { uploadedBy: { select: userSelect } },
    orderBy: { createdAt: "desc" as const }
  },
  paymentApprovalAlert: {
    select: { id: true, status: true, dueDate: true, acknowledgedAt: true, resolvedAt: true }
  },
  priceCounterOffers: {
    include: { createdBy: { select: userSelect } },
    orderBy: { createdAt: "desc" as const }
  }
} satisfies Prisma.WorkOrderInclude;

function visibleWorkOrderWhere(user: AuthUser, id?: string): Prisma.WorkOrderWhereInput {
  const identity = id ? { id } : {};
  if (user.role === Role.MACHINE_OPERATOR) {
    return { ...identity, OR: [{ machine: { operatorId: user.id } }, { createdById: user.id }] };
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
  return { actorId: actor.id, action, entityType: "WorkOrder", entityId, details, ipAddress };
}

function draftData(input: CreateWorkOrderInput | UpdateWorkOrderInput) {
  return {
    ...(input.machineId !== undefined ? { machineId: input.machineId } : {}),
    ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
    ...(input.sourceAlertId !== undefined ? { sourceAlertId: input.sourceAlertId } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.scheduledDate !== undefined ? { scheduledDate: input.scheduledDate } : {}),
    ...(input.replacedParts !== undefined ? { replacedParts: input.replacedParts } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {})
  };
}

function assertStatus(current: WorkOrderStatus, expected: WorkOrderStatus) {
  if (current !== expected) throw new HttpError(409, `Work order must be ${expected} for this transition`);
}

function assertProviderRelationship(providerId: string | null, actor: AuthUser) {
  if (actor.role !== Role.SERVICE_PROVIDER || providerId !== actor.id) {
    throw new HttpError(403, "Only the assigned service provider may perform this action");
  }
}

async function assertMachineAccess(tx: Prisma.TransactionClient, machineId: string, actor: AuthUser) {
  const machine = await tx.machine.findUnique({ where: { id: machineId }, select: { id: true, operatorId: true } });
  if (!machine) throw new HttpError(400, "Selected machine does not exist");
  if (actor.role === Role.MACHINE_OPERATOR && machine.operatorId !== actor.id) {
    throw new HttpError(403, "Machine operators may only create requests for their assigned machines");
  }
  return machine;
}

async function assertActiveProvider(tx: Prisma.TransactionClient, providerId: string) {
  const provider = await tx.user.findFirst({
    where: { id: providerId, role: Role.SERVICE_PROVIDER, isActive: true },
    select: { id: true }
  });
  if (!provider) throw new HttpError(400, "Selected provider must be an active service provider");
}

async function assertSourceAlert(
  tx: Prisma.TransactionClient,
  sourceAlertId: string,
  machineId: string,
  currentWorkOrderId?: string
) {
  const alert = await tx.alert.findUnique({
    where: { id: sourceAlertId },
    select: { id: true, machineId: true, status: true, type: true }
  });
  if (!alert || alert.machineId !== machineId || alert.type === AlertType.PAYMENT_APPROVAL) {
    throw new HttpError(400, "Source alert must belong to the selected machine");
  }
  if (alert.status === AlertStatus.RESOLVED) throw new HttpError(409, "A resolved alert cannot start a new work order");
  const duplicate = await tx.workOrder.findFirst({
    where: {
      sourceAlertId,
      ...(currentWorkOrderId ? { id: { not: currentWorkOrderId } } : {}),
      status: { notIn: terminalStatuses }
    },
    select: { id: true }
  });
  if (duplicate) throw new HttpError(409, "This alert already has an active work order");
}

async function loadWorkOrder(tx: Prisma.TransactionClient, id: string) {
  const workOrder = await tx.workOrder.findUnique({ where: { id }, include: workOrderInclude });
  if (!workOrder) throw new HttpError(404, "Work order not found");
  return workOrder;
}

type LoadedWorkOrder = Awaited<ReturnType<typeof loadWorkOrder>>;

function monetaryTotals(workOrder: LoadedWorkOrder) {
  const serviceCost = Number(workOrder.serviceCost ?? 0);
  const partsTotal = workOrder.replacements.reduce(
    (total, replacement) => total + replacement.quantity * Number(replacement.unitCost ?? 0),
    0
  );
  const finalTotal = Math.round((serviceCost + partsTotal) * 100) / 100;
  const proposedBudget = workOrder.proposedBudget === null ? null : Number(workOrder.proposedBudget);
  return {
    proposedBudget,
    serviceCost,
    partsTotal: Math.round(partsTotal * 100) / 100,
    finalTotal,
    budgetVariance: proposedBudget === null ? null : Math.round((finalTotal - proposedBudget) * 100) / 100
  };
}

function assertDraftActor(current: LoadedWorkOrder, actor: AuthUser) {
  if (
    actor.role === Role.MACHINE_OPERATOR &&
    current.machine.operatorId !== actor.id &&
    current.createdById !== actor.id
  ) {
    throw new HttpError(403, "Machine operators may only manage requests for their own machines");
  }
}

async function updateStatus(
  tx: Prisma.TransactionClient,
  id: string,
  status: WorkOrderStatus,
  data: Prisma.WorkOrderUncheckedUpdateInput = {}
) {
  return tx.workOrder.update({ where: { id }, data: { ...data, status }, include: workOrderInclude });
}

export async function listWorkOrders(user: AuthUser) {
  return prisma.workOrder.findMany({
    where: visibleWorkOrderWhere(user),
    include: workOrderInclude,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function getWorkOrder(id: string, user: AuthUser) {
  const workOrder = await prisma.workOrder.findFirst({ where: visibleWorkOrderWhere(user, id), include: workOrderInclude });
  if (!workOrder) throw new HttpError(404, "Work order not found");
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
    await assertMachineAccess(tx, input.machineId, actor);
    if (actor.role === Role.MACHINE_OPERATOR && input.providerId) {
      throw new HttpError(403, "Management assigns the service provider during approval");
    }
    if (input.providerId) await assertActiveProvider(tx, input.providerId);
    if (input.sourceAlertId) await assertSourceAlert(tx, input.sourceAlertId, input.machineId);
    const workOrder = await tx.workOrder.create({
      data: { ...draftData(input), createdById: actor.id, status: WorkOrderStatus.DRAFT } as Prisma.WorkOrderUncheckedCreateInput,
      include: workOrderInclude
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_CREATED", workOrder.id, {
        machineId: input.machineId,
        sourceAlertId: input.sourceAlertId ?? null
      }, ipAddress)
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
    assertDraftActor(current, actor);
    if (actor.role === Role.MACHINE_OPERATOR && input.providerId) {
      throw new HttpError(403, "Management assigns the service provider during approval");
    }
    const machineId = input.machineId ?? current.machineId;
    if (input.machineId !== undefined) await assertMachineAccess(tx, input.machineId, actor);
    if (input.providerId) await assertActiveProvider(tx, input.providerId);
    const sourceAlertId = input.sourceAlertId === undefined ? current.sourceAlertId : input.sourceAlertId;
    if (sourceAlertId) await assertSourceAlert(tx, sourceAlertId, machineId, id);
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
    assertDraftActor(current, actor);
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.PENDING_MANAGEMENT_APPROVAL);
    await tx.auditLog.create({ data: auditData(actor, "WORK_ORDER_SUBMITTED", id, { submittedById: actor.id }, ipAddress) });
    return workOrder;
  });
}

export async function approveAndDispatchWorkOrder(
  id: string,
  input: ApproveAndDispatchInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertStatus(current.status, WorkOrderStatus.PENDING_MANAGEMENT_APPROVAL);
    await assertActiveProvider(tx, input.providerId);
    const approvedAt = new Date();
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.SENT_TO_PROVIDER, {
      providerId: input.providerId,
      proposedBudget: input.proposedBudget,
      managementApprovedById: actor.id,
      managementApprovedAt: approvedAt,
      rejectionReason: null
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_APPROVED_AND_DISPATCHED", id, {
        providerId: input.providerId,
        proposedBudget: input.proposedBudget,
        managementApprovedAt: approvedAt.toISOString()
      }, ipAddress)
    });
    return workOrder;
  });
}

export async function rejectWorkOrder(
  id: string,
  input: RejectWorkOrderInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertStatus(current.status, WorkOrderStatus.PENDING_MANAGEMENT_APPROVAL);
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.REJECTED, { rejectionReason: input.reason ?? null });
    await tx.auditLog.create({ data: auditData(actor, "WORK_ORDER_REJECTED", id, { reason: input.reason ?? null }, ipAddress) });
    return workOrder;
  });
}

export async function approveWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    if (current.machine.operatorId !== actor.id) {
      throw new HttpError(403, "Only the assigned machine operator may approve this legacy work order");
    }
    assertStatus(current.status, WorkOrderStatus.PENDING_OPERATOR_APPROVAL);
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.APPROVED, { approvedByOperatorId: actor.id });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_APPROVED", id, { approvedByOperatorId: actor.id, legacy: true }, ipAddress)
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
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.SENT_TO_PROVIDER, {
      providerId,
      managementApprovedById: actor.id,
      managementApprovedAt: new Date()
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_SENT_TO_PROVIDER", id, { providerId, legacy: true }, ipAddress)
    });
    return workOrder;
  });
}

export async function acceptWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertProviderRelationship(current.providerId, actor);
    assertStatus(current.status, WorkOrderStatus.SENT_TO_PROVIDER);
    const acceptedAt = new Date();
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.PROVIDER_ACCEPTED, { providerAcceptedAt: acceptedAt });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_PROVIDER_ACCEPTED", id, { acceptedAt: acceptedAt.toISOString() }, ipAddress)
    });
    return workOrder;
  });
}

export async function startWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertProviderRelationship(current.providerId, actor);
    assertStatus(current.status, WorkOrderStatus.PROVIDER_ACCEPTED);
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.IN_PROGRESS);
    await tx.auditLog.create({ data: auditData(actor, "WORK_ORDER_STARTED", id, { providerId: actor.id }, ipAddress) });
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
    assertProviderRelationship(current.providerId, actor);
    if (!providerEditableStatuses.includes(current.status)) {
      throw new HttpError(409, "Service details can only be updated after acceptance and before submission");
    }
    const workOrder = await tx.workOrder.update({
      where: { id },
      data: {
        ...(input.completedDate !== undefined ? { completedDate: input.completedDate } : {}),
        ...(input.serviceCost !== undefined ? { serviceCost: input.serviceCost } : {}),
        ...(input.replacedParts !== undefined ? { replacedParts: input.replacedParts } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.providerBusinessName !== undefined ? { providerBusinessName: input.providerBusinessName } : {}),
        ...(input.providerAddress !== undefined ? { providerAddress: input.providerAddress } : {}),
        ...(input.providerRegistrationNumber !== undefined
          ? { providerRegistrationNumber: input.providerRegistrationNumber }
          : {}),
        ...(input.providerContact !== undefined ? { providerContact: input.providerContact } : {}),
        ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {})
      } as Prisma.WorkOrderUncheckedUpdateInput,
      include: workOrderInclude
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_SERVICE_DETAILS_UPDATED", id, { changedFields: Object.keys(input) }, ipAddress)
    });
    return workOrder;
  });
}

export async function addReplacement(
  id: string,
  input: CreateReplacementInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertProviderRelationship(current.providerId, actor);
    if (!providerEditableStatuses.includes(current.status)) {
      throw new HttpError(409, "Replacement lines can only be edited before completion submission");
    }
    if (input.machinePartId) {
      const part = await tx.machinePart.findFirst({
        where: { id: input.machinePartId, machineId: current.machineId },
        select: { id: true }
      });
      if (!part) throw new HttpError(400, "Selected machine part does not belong to this work order's machine");
    }
    const replacement = await tx.workOrderReplacement.create({
      data: { workOrderId: id, ...input } as Prisma.WorkOrderReplacementUncheckedCreateInput
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_REPLACEMENT_ADDED", id, {
        replacementId: replacement.id,
        partName: replacement.partName
      }, ipAddress)
    });
    return replacement;
  });
}

export async function deleteReplacement(
  id: string,
  replacementId: string,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertProviderRelationship(current.providerId, actor);
    if (!providerEditableStatuses.includes(current.status)) {
      throw new HttpError(409, "Replacement lines can only be edited before completion submission");
    }
    const replacement = await tx.workOrderReplacement.findFirst({ where: { id: replacementId, workOrderId: id } });
    if (!replacement) throw new HttpError(404, "Replacement line not found");
    await tx.workOrderReplacement.delete({ where: { id: replacementId } });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_REPLACEMENT_REMOVED", id, {
        replacementId,
        partName: replacement.partName
      }, ipAddress)
    });
  });
}

export async function updateReplacement(
  id: string,
  replacementId: string,
  input: UpdateReplacementInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertProviderRelationship(current.providerId, actor);
    if (!providerEditableStatuses.includes(current.status)) {
      throw new HttpError(409, "Replacement lines can only be edited before completion submission");
    }
    const existing = await tx.workOrderReplacement.findFirst({ where: { id: replacementId, workOrderId: id } });
    if (!existing) throw new HttpError(404, "Replacement line not found");
    if (input.machinePartId) {
      const part = await tx.machinePart.findFirst({
        where: { id: input.machinePartId, machineId: current.machineId },
        select: { id: true }
      });
      if (!part) throw new HttpError(400, "Selected machine part does not belong to this work order's machine");
    }
    const replacement = await tx.workOrderReplacement.update({
      where: { id: replacementId },
      data: input as Prisma.WorkOrderReplacementUncheckedUpdateInput
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_REPLACEMENT_UPDATED", id, {
        replacementId,
        partName: replacement.partName,
        unitCost: input.unitCost ?? null,
        quantity: input.quantity
      }, ipAddress)
    });
    return replacement;
  });
}

export async function submitCompletion(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertProviderRelationship(current.providerId, actor);
    if (
      current.status !== WorkOrderStatus.IN_PROGRESS &&
      current.status !== WorkOrderStatus.PRICE_REVISION_REQUESTED
    ) {
      throw new HttpError(409, "Work order must be in progress or awaiting a price revision for this transition");
    }
    if (current.serviceCost === null) {
      throw new HttpError(409, "Enter the service or labour cost before submitting completion");
    }
    const replacementWithoutCost = current.replacements.find((replacement) => replacement.unitCost === null);
    if (replacementWithoutCost) {
      throw new HttpError(409, `Enter a unit cost for ${replacementWithoutCost.partName} before submitting completion`);
    }
    const totals = monetaryTotals(current);
    const submittedAt = new Date();
    const completedDate = current.completedDate ?? submittedAt;
    const paymentAlert = await tx.alert.upsert({
      where: { paymentWorkOrderId: id },
      update: {
        status: AlertStatus.OPEN,
        dueDate: submittedAt,
        message: `Payment approval is required for ${current.title}. Final total: LKR ${totals.finalTotal.toFixed(2)}`,
        acknowledgedAt: null,
        resolvedAt: null
      },
      create: {
        machineId: current.machineId,
        paymentWorkOrderId: id,
        type: AlertType.PAYMENT_APPROVAL,
        status: AlertStatus.OPEN,
        dueDate: submittedAt,
        message: `Payment approval is required for ${current.title}. Final total: LKR ${totals.finalTotal.toFixed(2)}`,
        dedupeKey: `PAYMENT_APPROVAL:${id}`
      }
    });
    const respondedCounter = current.priceCounterOffers.find((offer) => offer.respondedAt === null);
    if (respondedCounter) {
      await tx.workOrderPriceCounter.updateMany({
        where: { workOrderId: id, respondedAt: null },
        data: { respondedAt: submittedAt }
      });
    }
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.AWAITING_PAYMENT_APPROVAL, {
      completedDate,
      completionSubmittedAt: submittedAt
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_COMPLETION_SUBMITTED", id, {
        paymentAlertId: paymentAlert.id,
        respondedToCounterOfferId: respondedCounter?.id ?? null,
        completedDate: completedDate.toISOString(),
        ...totals
      }, ipAddress)
    });
    return workOrder;
  });
}

export const completeWorkOrder = submitCompletion;

export async function counterPayment(
  id: string,
  input: CounterPaymentInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertStatus(current.status, WorkOrderStatus.AWAITING_PAYMENT_APPROVAL);
    const totals = monetaryTotals(current);
    const counteredAt = new Date();
    const counterOffer = await tx.workOrderPriceCounter.create({
      data: {
        workOrderId: id,
        createdById: actor.id,
        counterBudget: input.counterBudget,
        reviewedTotal: totals.finalTotal,
        reason: input.reason
      }
    });
    const paymentAlert = await tx.alert.findUnique({
      where: { paymentWorkOrderId: id },
      select: { id: true, status: true }
    });
    if (paymentAlert && paymentAlert.status !== AlertStatus.RESOLVED) {
      await tx.alert.update({
        where: { id: paymentAlert.id },
        data: { status: AlertStatus.RESOLVED, resolvedAt: counteredAt }
      });
    }
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.PRICE_REVISION_REQUESTED, {
      proposedBudget: input.counterBudget,
      completionSubmittedAt: null
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_PAYMENT_COUNTERED", id, {
        counterOfferId: counterOffer.id,
        previousBudget: totals.proposedBudget,
        counterBudget: input.counterBudget,
        reviewedTotal: totals.finalTotal,
        reason: input.reason
      }, ipAddress)
    });
    return workOrder;
  });
}

export async function approvePayment(
  id: string,
  input: ApprovePaymentInput,
  actor: AuthUser,
  ipAddress?: string
) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    assertStatus(current.status, WorkOrderStatus.AWAITING_PAYMENT_APPROVAL);
    const totals = monetaryTotals(current);
    const appliedPartIds: string[] = [];
    for (const replacement of current.replacements) {
      const partData = {
        name: replacement.partName,
        partNumber: replacement.partNumber,
        quantity: replacement.quantity,
        warrantyStart: replacement.warrantyStart,
        warrantyEnd: replacement.warrantyEnd,
        replacementDue: replacement.nextReplacementDate
      };
      if (replacement.machinePartId) {
        const part = await tx.machinePart.findFirst({
          where: { id: replacement.machinePartId, machineId: current.machineId },
          select: { id: true }
        });
        if (!part) throw new HttpError(409, "A replacement references a part that no longer belongs to this machine");
        await tx.machinePart.update({ where: { id: part.id }, data: partData });
        appliedPartIds.push(part.id);
      } else {
        const part = await tx.machinePart.create({ data: { machineId: current.machineId, ...partData } });
        await tx.workOrderReplacement.update({ where: { id: replacement.id }, data: { machinePartId: part.id } });
        appliedPartIds.push(part.id);
      }
    }
    const paymentAlert = await tx.alert.findUnique({
      where: { paymentWorkOrderId: id },
      select: { id: true, status: true }
    });
    if (paymentAlert && paymentAlert.status !== AlertStatus.RESOLVED) {
      await tx.alert.update({ where: { id: paymentAlert.id }, data: { status: AlertStatus.RESOLVED, resolvedAt: new Date() } });
    }
    const approvedAt = new Date();
    const workOrder = await updateStatus(tx, id, WorkOrderStatus.CLOSED, {
      paymentApprovedById: actor.id,
      paymentApprovedAt: approvedAt,
      paymentReference: input.paymentReference ?? null
    });
    await tx.auditLog.create({
      data: auditData(actor, "WORK_ORDER_PAYMENT_APPROVED", id, {
        paymentReference: input.paymentReference ?? null,
        paymentAlertId: paymentAlert?.id ?? null,
        appliedPartIds,
        ...totals
      }, ipAddress)
    });
    return workOrder;
  });
}

export async function cancelWorkOrder(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const current = await loadWorkOrder(tx, id);
    if (terminalStatuses.includes(current.status)) throw new HttpError(409, "Terminal work orders cannot be cancelled");
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
    assertProviderRelationship(current.providerId, actor);
    if (!providerEvidenceStatuses.includes(current.status)) {
      throw new HttpError(409, "Evidence can only be added after provider acceptance");
    }
    const evidence = await tx.serviceEvidence.create({ data: { workOrderId: id, uploadedById: actor.id, ...input } });
    await tx.auditLog.create({
      data: auditData(actor, "SERVICE_EVIDENCE_ADDED", id, {
        evidenceId: evidence.id,
        type: evidence.type,
        fileName: evidence.fileName
      }, ipAddress)
    });
    return evidence;
  });
}
