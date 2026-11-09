export type Role = "ADMIN" | "OWNER" | "MANAGER" | "MACHINE_OPERATOR" | "SERVICE_PROVIDER";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardSummary = {
  role: Role;
  totals: {
    machines: number;
    openAlerts: number;
    activeWorkOrders: number;
    activeUsers: number;
  };
};

export type MachineStatus = "ACTIVE" | "INACTIVE" | "UNDER_MAINTENANCE" | "RETIRED";
export type MaintenanceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";

export type Operator = Pick<User, "id" | "name" | "email" | "role" | "isActive">;

export type Machine = {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  location: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  status: MachineStatus;
  operatorId: string | null;
  operator: Operator | null;
  createdAt: string;
  updatedAt: string;
  _count?: { parts: number; plans: number };
};

export type MachineInput = {
  assetCode: string;
  name: string;
  category: string;
  location: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  warrantyStart?: string | null;
  warrantyEnd?: string | null;
  status: MachineStatus;
  operatorId?: string | null;
};

export type MachinePart = {
  id: string;
  machineId: string;
  name: string;
  partNumber: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  replacementDue: string | null;
  quantity: number;
  createdAt: string;
  updatedAt: string;
};

export type MachinePartInput = {
  name: string;
  partNumber?: string | null;
  warrantyStart?: string | null;
  warrantyEnd?: string | null;
  replacementDue?: string | null;
  quantity: number;
};

export type MaintenancePlan = {
  id: string;
  machineId: string;
  title: string;
  description: string | null;
  frequency: MaintenanceFrequency;
  intervalDays: number | null;
  nextDueDate: string;
  thresholdDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MaintenancePlanInput = {
  title: string;
  description?: string | null;
  frequency: MaintenanceFrequency;
  intervalDays?: number | null;
  nextDueDate: string;
  thresholdDays: number;
  isActive: boolean;
};

export type AlertType = "MACHINE_WARRANTY" | "PART_WARRANTY" | "PART_REPLACEMENT" | "MAINTENANCE_DUE";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type MaintenanceAlert = {
  id: string;
  type: AlertType;
  status: AlertStatus;
  dueDate: string;
  message: string;
  acknowledgedAt: string | null;
  createdAt: string;
  machine: Pick<Machine, "id" | "assetCode" | "name" | "location" | "operatorId">;
  part: Pick<MachinePart, "id" | "name" | "partNumber"> | null;
  plan: Pick<MaintenancePlan, "id" | "title"> | null;
};

export type AlertSummary = {
  open: number;
  acknowledged: number;
  overdue: number;
  dueSoon: number;
};

export type AlertSchedulerResult = {
  created: number;
  existing: number;
  resolved: number;
  evaluatedAt: string;
};

export type WorkOrderStatus =
  | "DRAFT"
  | "PENDING_OPERATOR_APPROVAL"
  | "APPROVED"
  | "SENT_TO_PROVIDER"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type EvidenceType = "SERVICE_REPORT" | "INVOICE" | "PAYMENT_SLIP" | "PHOTO" | "OTHER";

export type WorkOrderProvider = Pick<User, "id" | "name" | "email" | "role" | "isActive">;

export type ServiceEvidence = {
  id: string;
  workOrderId: string;
  type: EvidenceType;
  fileName: string;
  fileUrl: string | null;
  notes: string | null;
  createdAt: string;
};

export type WorkOrder = {
  id: string;
  machineId: string;
  machine: Pick<Machine, "id" | "assetCode" | "name" | "location" | "operatorId">;
  providerId: string | null;
  provider: WorkOrderProvider | null;
  approvedByOperatorId: string | null;
  approvedByOperator: Pick<User, "id" | "name" | "email"> | null;
  title: string;
  description: string | null;
  status: WorkOrderStatus;
  scheduledDate: string | null;
  completedDate: string | null;
  cost: number | string | null;
  notes: string | null;
  replacedParts: string | null;
  evidence: ServiceEvidence[];
  createdAt: string;
  updatedAt: string;
};

export type WorkOrderInput = {
  machineId: string;
  title: string;
  description?: string | null;
  scheduledDate?: string | null;
  cost?: number | null;
  notes?: string | null;
  replacedParts?: string | null;
};

export type ServiceEvidenceInput = {
  type: EvidenceType;
  fileName: string;
  fileUrl?: string | null;
  notes?: string | null;
};

export type WorkOrderServiceDetailsInput = {
  completedDate?: string | null;
  cost?: number | null;
  replacedParts?: string | null;
  notes?: string | null;
};

export type UserInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function getSetupStatus() {
  return apiRequest<{ needsSetup: boolean }>("/auth/setup-status");
}

export function setupAdmin(input: Omit<UserInput, "role">) {
  return apiRequest<{ user: User }>("/auth/setup-admin", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function login(email: string, password: string) {
  return apiRequest<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function getCurrentUser() {
  return apiRequest<{ user: User }>("/auth/me");
}

export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function getDashboardSummary() {
  return apiRequest<DashboardSummary>("/dashboard/summary");
}

export function getUsers() {
  return apiRequest<{ users: User[] }>("/users");
}

export function createUser(input: UserInput) {
  return apiRequest<{ user: User }>("/users", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateUser(id: string, input: Partial<UserInput & Pick<User, "isActive">>) {
  return apiRequest<{ user: User }>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function getMachines() {
  return apiRequest<{ machines: Machine[] }>("/machines");
}

export function getMachine(id: string) {
  return apiRequest<{ machine: Machine }>(`/machines/${id}`);
}

export function createMachine(input: MachineInput) {
  return apiRequest<{ machine: Machine }>("/machines", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMachine(id: string, input: Partial<MachineInput>) {
  return apiRequest<{ machine: Machine }>(`/machines/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteMachine(id: string) {
  return apiRequest<void>(`/machines/${id}`, { method: "DELETE" });
}

export function getOperators() {
  return apiRequest<{ operators: Operator[] }>("/operators");
}

export function getMachineParts(machineId: string) {
  return apiRequest<{ parts: MachinePart[] }>(`/machines/${machineId}/parts`);
}

export function createMachinePart(machineId: string, input: MachinePartInput) {
  return apiRequest<{ part: MachinePart }>(`/machines/${machineId}/parts`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMachinePart(machineId: string, partId: string, input: Partial<MachinePartInput>) {
  return apiRequest<{ part: MachinePart }>(`/machines/${machineId}/parts/${partId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteMachinePart(machineId: string, partId: string) {
  return apiRequest<void>(`/machines/${machineId}/parts/${partId}`, { method: "DELETE" });
}

export function getMaintenancePlans(machineId: string) {
  return apiRequest<{ plans: MaintenancePlan[] }>(`/machines/${machineId}/plans`);
}

export function createMaintenancePlan(machineId: string, input: MaintenancePlanInput) {
  return apiRequest<{ plan: MaintenancePlan }>(`/machines/${machineId}/plans`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMaintenancePlan(machineId: string, planId: string, input: Partial<MaintenancePlanInput>) {
  return apiRequest<{ plan: MaintenancePlan }>(`/machines/${machineId}/plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteMaintenancePlan(machineId: string, planId: string) {
  return apiRequest<void>(`/machines/${machineId}/plans/${planId}`, { method: "DELETE" });
}

export function getAlerts() {
  return apiRequest<{ alerts: MaintenanceAlert[]; summary: AlertSummary }>("/alerts");
}

export function acknowledgeAlert(id: string) {
  return apiRequest<{ alert: MaintenanceAlert }>(`/alerts/${id}/acknowledge`, { method: "PATCH" });
}

export function runAlertScheduler() {
  return apiRequest<{ result: AlertSchedulerResult }>("/alerts/run-scheduler", { method: "POST" });
}

export function getWorkOrders() {
  return apiRequest<{ workOrders: WorkOrder[] }>("/work-orders");
}

export function getWorkOrder(id: string) {
  return apiRequest<{ workOrder: WorkOrder }>(`/work-orders/${id}`);
}

export function getWorkOrderProviders() {
  return apiRequest<{ providers: WorkOrderProvider[] }>("/work-orders/providers");
}

export function createWorkOrder(input: WorkOrderInput) {
  return apiRequest<{ workOrder: WorkOrder }>("/work-orders", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateWorkOrder(id: string, input: Partial<WorkOrderInput>) {
  return apiRequest<{ workOrder: WorkOrder }>(`/work-orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function updateWorkOrderServiceDetails(id: string, input: WorkOrderServiceDetailsInput) {
  return apiRequest<{ workOrder: WorkOrder }>(`/work-orders/${id}/service-details`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

function runWorkOrderAction(id: string, action: string, body?: object) {
  return apiRequest<{ workOrder: WorkOrder }>(`/work-orders/${id}/${action}`, {
    method: "POST",
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

export function submitWorkOrder(id: string) {
  return runWorkOrderAction(id, "submit");
}

export function approveWorkOrder(id: string) {
  return runWorkOrderAction(id, "approve");
}

export function sendWorkOrderToProvider(id: string, providerId: string) {
  return runWorkOrderAction(id, "send-to-provider", { providerId });
}

export function startWorkOrder(id: string) {
  return runWorkOrderAction(id, "start");
}

export function completeWorkOrder(id: string) {
  return runWorkOrderAction(id, "complete");
}

export function cancelWorkOrder(id: string) {
  return runWorkOrderAction(id, "cancel");
}

export function addWorkOrderEvidence(id: string, input: ServiceEvidenceInput) {
  return apiRequest<{ evidence: ServiceEvidence; workOrder?: WorkOrder }>(`/work-orders/${id}/evidence`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}
