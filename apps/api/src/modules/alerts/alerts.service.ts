import { AlertStatus, AlertType, Prisma, Role } from "@prisma/client";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../lib/prisma.js";
import { withSerializableTransaction } from "../../lib/transactions.js";
import type { AuthUser } from "../auth/auth.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD_DAYS = 7;
const MANAGED_ALERT_TYPES = Object.values(AlertType);
const ALERT_SCHEDULER_LOCK_ID = 340_034;
const ALERTABLE_MACHINE_STATUSES = ["ACTIVE", "UNDER_MAINTENANCE"] as const;

type AlertCandidate = {
  dedupeKey: string;
  type: AlertType;
  dueDate: Date;
  message: string;
  machineId: string;
  partId?: string;
  planId?: string;
};

type SchedulerActor = Pick<AuthUser, "id">;

export type SchedulerResult = {
  created: number;
  existing: number;
  resolved: number;
  evaluatedAt: string;
};

const alertInclude = {
  machine: { select: { id: true, assetCode: true, name: true, location: true, operatorId: true } },
  part: { select: { id: true, name: true, partNumber: true } },
  plan: { select: { id: true, title: true } }
} satisfies Prisma.AlertInclude;

function startOfBusinessDay(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.ALERT_SCHEDULER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isDueWithin(dueDate: Date, today: Date, thresholdDays: number) {
  return dueDate.getTime() <= addUtcDays(today, thresholdDays).getTime();
}

function candidateKey(type: AlertType, sourceId: string, dueDate: Date) {
  return `${type}:${sourceId}:${dateKey(dueDate)}`;
}

function visibleAlertWhere(user: AuthUser): Prisma.AlertWhereInput {
  return user.role === Role.MACHINE_OPERATOR ? { machine: { operatorId: user.id } } : {};
}

function schedulerAudit(
  actor: SchedulerActor | undefined,
  action: string,
  entityId: string | null,
  details: Prisma.InputJsonValue,
  ipAddress?: string
): Prisma.AuditLogUncheckedCreateInput {
  return { actorId: actor?.id, action, entityType: "Alert", entityId, details, ipAddress };
}

async function collectCandidates(tx: Prisma.TransactionClient, now: Date) {
  const today = startOfBusinessDay(now);
  const defaultCutoff = addUtcDays(today, DEFAULT_THRESHOLD_DAYS);
  const [machines, parts, plans] = await Promise.all([
    tx.machine.findMany({
      where: {
        status: { in: [...ALERTABLE_MACHINE_STATUSES] },
        warrantyEnd: { not: null, lte: defaultCutoff }
      },
      select: { id: true, assetCode: true, name: true, warrantyEnd: true }
    }),
    tx.machinePart.findMany({
      where: {
        machine: { status: { in: [...ALERTABLE_MACHINE_STATUSES] } },
        OR: [
          { warrantyEnd: { not: null, lte: defaultCutoff } },
          { replacementDue: { not: null, lte: defaultCutoff } }
        ]
      },
      select: {
        id: true,
        name: true,
        warrantyEnd: true,
        replacementDue: true,
        machine: { select: { id: true, assetCode: true, name: true } }
      }
    }),
    tx.maintenancePlan.findMany({
      where: {
        isActive: true,
        machine: { status: { in: [...ALERTABLE_MACHINE_STATUSES] } }
      },
      select: {
        id: true,
        title: true,
        nextDueDate: true,
        thresholdDays: true,
        machine: { select: { id: true, assetCode: true, name: true } }
      }
    })
  ]);

  const candidates: AlertCandidate[] = [];
  for (const machine of machines) {
    if (!machine.warrantyEnd) continue;
    candidates.push({
      dedupeKey: candidateKey(AlertType.MACHINE_WARRANTY, machine.id, machine.warrantyEnd),
      type: AlertType.MACHINE_WARRANTY,
      dueDate: machine.warrantyEnd,
      message: `${machine.assetCode} ${machine.name} warranty expires on ${dateKey(machine.warrantyEnd)}`,
      machineId: machine.id
    });
  }

  for (const part of parts) {
    if (part.warrantyEnd && isDueWithin(part.warrantyEnd, today, DEFAULT_THRESHOLD_DAYS)) {
      candidates.push({
        dedupeKey: candidateKey(AlertType.PART_WARRANTY, part.id, part.warrantyEnd),
        type: AlertType.PART_WARRANTY,
        dueDate: part.warrantyEnd,
        message: `${part.name} warranty on ${part.machine.assetCode} expires on ${dateKey(part.warrantyEnd)}`,
        machineId: part.machine.id,
        partId: part.id
      });
    }
    if (part.replacementDue && isDueWithin(part.replacementDue, today, DEFAULT_THRESHOLD_DAYS)) {
      candidates.push({
        dedupeKey: candidateKey(AlertType.PART_REPLACEMENT, part.id, part.replacementDue),
        type: AlertType.PART_REPLACEMENT,
        dueDate: part.replacementDue,
        message: `${part.name} on ${part.machine.assetCode} is due for replacement on ${dateKey(part.replacementDue)}`,
        machineId: part.machine.id,
        partId: part.id
      });
    }
  }

  for (const plan of plans) {
    if (!isDueWithin(plan.nextDueDate, today, plan.thresholdDays)) continue;
    candidates.push({
      dedupeKey: candidateKey(AlertType.MAINTENANCE_DUE, plan.id, plan.nextDueDate),
      type: AlertType.MAINTENANCE_DUE,
      dueDate: plan.nextDueDate,
      message: `${plan.title} for ${plan.machine.assetCode} is due on ${dateKey(plan.nextDueDate)}`,
      machineId: plan.machine.id,
      planId: plan.id
    });
  }
  return candidates;
}

async function executeScheduler(now: Date, actor?: SchedulerActor, ipAddress?: string): Promise<SchedulerResult> {
  return withSerializableTransaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1::int AS "locked"
      FROM (SELECT pg_advisory_xact_lock(${ALERT_SCHEDULER_LOCK_ID})) AS advisory_lock
    `;
    const candidates = await collectCandidates(tx, now);
    const activeKeys = new Set(candidates.map((candidate) => candidate.dedupeKey));
    let created = 0;
    let existing = 0;
    let resolved = 0;

    for (const candidate of candidates) {
      const current = await tx.alert.findUnique({ where: { dedupeKey: candidate.dedupeKey } });
      if (!current) {
        const alert = await tx.alert.create({ data: candidate });
        await tx.auditLog.create({
          data: schedulerAudit(actor, "ALERT_GENERATED", alert.id, {
            dedupeKey: candidate.dedupeKey,
            type: candidate.type,
            dueDate: dateKey(candidate.dueDate)
          }, ipAddress)
        });
        created += 1;
        continue;
      }
      if (current.status === AlertStatus.RESOLVED) {
        await tx.alert.update({
          where: { id: current.id },
          data: {
            status: AlertStatus.OPEN,
            acknowledgedAt: null,
            resolvedAt: null,
            message: candidate.message,
            dueDate: candidate.dueDate
          }
        });
        await tx.auditLog.create({
          data: schedulerAudit(actor, "ALERT_GENERATED", current.id, {
            dedupeKey: candidate.dedupeKey,
            reopened: true
          }, ipAddress)
        });
        created += 1;
      } else {
        existing += 1;
      }
    }

    const staleAlerts = await tx.alert.findMany({
      where: {
        type: { in: MANAGED_ALERT_TYPES },
        status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] }
      },
      select: { id: true, dedupeKey: true }
    });
    for (const stale of staleAlerts) {
      if (activeKeys.has(stale.dedupeKey)) continue;
      await tx.alert.update({ where: { id: stale.id }, data: { status: AlertStatus.RESOLVED, resolvedAt: now } });
      await tx.auditLog.create({
        data: schedulerAudit(actor, "ALERT_RESOLVED", stale.id, { dedupeKey: stale.dedupeKey }, ipAddress)
      });
      resolved += 1;
    }

    await tx.auditLog.create({
      data: {
        actorId: actor?.id,
        action: "ALERT_SCHEDULER_RUN",
        entityType: "AlertScheduler",
        details: { created, existing, resolved, evaluatedAt: now.toISOString() },
        ipAddress
      }
    });
    return { created, existing, resolved, evaluatedAt: now.toISOString() };
  });
}

export async function runAlertScheduler(now = new Date(), actor?: SchedulerActor, ipAddress?: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await executeScheduler(now, actor, ipAddress);
    } catch (error) {
      const isDedupeRace = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isDedupeRace || attempt === 3) throw error;
    }
  }
  throw new Error("Alert scheduler retry limit exceeded");
}

export async function listAlerts(user: AuthUser, filters: { status: AlertStatus | "ALL"; type: AlertType | "ALL" }) {
  const roleScope = visibleAlertWhere(user);
  const filterWhere: Prisma.AlertWhereInput = {
    ...roleScope,
    ...(filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.type !== "ALL" ? { type: filters.type } : {})
  };
  const activeWhere: Prisma.AlertWhereInput = {
    ...roleScope,
    status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] }
  };
  const today = startOfBusinessDay(new Date());
  const [alerts, activeAlerts] = await Promise.all([
    prisma.alert.findMany({ where: filterWhere, include: alertInclude, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] }),
    prisma.alert.findMany({ where: activeWhere, select: { status: true, dueDate: true } })
  ]);
  return {
    alerts,
    summary: {
      open: activeAlerts.filter((alert) => alert.status === AlertStatus.OPEN).length,
      acknowledged: activeAlerts.filter((alert) => alert.status === AlertStatus.ACKNOWLEDGED).length,
      overdue: activeAlerts.filter((alert) => alert.dueDate < today).length,
      dueSoon: activeAlerts.filter((alert) => alert.dueDate >= today).length
    }
  };
}

export async function acknowledgeAlert(id: string, actor: AuthUser, ipAddress?: string) {
  return withSerializableTransaction(async (tx) => {
    const alert = await tx.alert.findFirst({ where: { id, ...visibleAlertWhere(actor) }, include: alertInclude });
    if (!alert) throw new HttpError(404, "Alert not found");
    if (alert.status === AlertStatus.RESOLVED) throw new HttpError(409, "Resolved alerts cannot be acknowledged");
    if (alert.status === AlertStatus.ACKNOWLEDGED) return alert;
    const acknowledged = await tx.alert.update({
      where: { id },
      data: { status: AlertStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
      include: alertInclude
    });
    await tx.auditLog.create({
      data: schedulerAudit(actor, "ALERT_ACKNOWLEDGED", id, {
        machineId: acknowledged.machineId,
        type: acknowledged.type
      }, ipAddress)
    });
    return acknowledged;
  });
}

