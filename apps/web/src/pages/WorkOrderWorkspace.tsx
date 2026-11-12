import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  MapPin,
  MessageSquareReply,
  Pencil,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  UserRound,
  Wrench,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  acceptWorkOrder,
  addWorkOrderEvidence,
  addWorkOrderReplacement,
  approveAndDispatchWorkOrder,
  approveWorkOrderPayment,
  cancelWorkOrder,
  counterWorkOrderPayment,
  createWorkOrder,
  deleteWorkOrderReplacement,
  getMachine,
  getMachineParts,
  getMachines,
  getMaintenancePlans,
  getOrganizationProfile,
  getWorkOrder,
  getWorkOrderProviders,
  getWorkOrders,
  rejectWorkOrder,
  startWorkOrder,
  submitWorkOrder,
  submitWorkOrderCompletion,
  updateWorkOrder,
  updateWorkOrderReplacement,
  updateWorkOrderServiceDetails,
  type EvidenceType,
  type Machine,
  type MachinePart,
  type MaintenancePlan,
  type OrganizationProfile,
  type ServiceEvidenceInput,
  type User,
  type WorkOrder,
  type WorkOrderCategory,
  type WorkOrderInput,
  type WorkOrderPriority,
  type WorkOrderProvider,
  type WorkOrderReplacementInput,
  type WorkOrderServiceDetailsInput,
  type WorkOrderStatus
} from "../services/api";

export type NewServiceRequest = {
  machineId: string;
  sourceAlertId: string;
  title: string;
  category: WorkOrderCategory;
};

type WorkOrderWorkspaceProps = {
  user: User;
  initialRequest?: NewServiceRequest | null;
  onInitialRequestConsumed?: () => void;
};

type WorkOrderDraft = Omit<WorkOrderInput, "scheduledDate"> & {
  scheduledDate: string;
};

type WorkOrderEditor = {
  mode: "create" | "edit";
  workOrderId?: string;
  draft: WorkOrderDraft;
};

type EvidenceDraft = { type: EvidenceType; fileName: string; fileUrl: string; notes: string };
type ServiceDetailsDraft = {
  completedDate: string;
  serviceCost: string;
  notes: string;
  providerBusinessName: string;
  providerAddress: string;
  providerRegistrationNumber: string;
  providerContact: string;
  invoiceNumber: string;
};
type ReplacementDraft = {
  machinePartId: string;
  partName: string;
  partNumber: string;
  quantity: number;
  unitCost: string;
  warrantyStart: string;
  warrantyEnd: string;
  nextReplacementDate: string;
  notes: string;
};

const statusLabels: Record<WorkOrderStatus, string> = {
  DRAFT: "Draft",
  PENDING_OPERATOR_APPROVAL: "Pending operator approval (legacy)",
  APPROVED: "Approved (legacy)",
  PENDING_MANAGEMENT_APPROVAL: "Management review",
  SENT_TO_PROVIDER: "Sent to provider",
  PROVIDER_ACCEPTED: "Provider accepted",
  IN_PROGRESS: "In progress",
  PRICE_REVISION_REQUESTED: "Price revision requested",
  COMPLETED: "Completed (legacy)",
  AWAITING_PAYMENT_APPROVAL: "Payment review",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled"
};

const categoryLabels: Record<WorkOrderCategory, string> = {
  BREAKDOWN_REPAIR: "Breakdown repair",
  PREVENTIVE_MAINTENANCE: "Preventive maintenance",
  WARRANTY_SERVICE: "Warranty service",
  PART_REPLACEMENT: "Part replacement",
  INSPECTION: "Inspection",
  OTHER: "Other"
};

const priorityLabels: Record<WorkOrderPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent"
};

const evidenceLabels: Record<EvidenceType, string> = {
  SERVICE_REPORT: "Service report",
  INVOICE: "Invoice",
  PAYMENT_SLIP: "Payment slip",
  PHOTO: "Photo",
  OTHER: "Other"
};

const workflowSteps: Array<{ status: WorkOrderStatus; label: string }> = [
  { status: "DRAFT", label: "Request" },
  { status: "PENDING_MANAGEMENT_APPROVAL", label: "Management review" },
  { status: "SENT_TO_PROVIDER", label: "Provider dispatch" },
  { status: "PROVIDER_ACCEPTED", label: "Provider accepted" },
  { status: "IN_PROGRESS", label: "Service" },
  { status: "AWAITING_PAYMENT_APPROVAL", label: "Payment review" },
  { status: "CLOSED", label: "Closed" }
];

const statuses = Object.keys(statusLabels) as WorkOrderStatus[];
const categories = Object.keys(categoryLabels) as WorkOrderCategory[];
const priorities = Object.keys(priorityLabels) as WorkOrderPriority[];
const evidenceTypes = Object.keys(evidenceLabels) as EvidenceType[];

function emptyWorkOrderDraft(initial?: NewServiceRequest): WorkOrderDraft {
  return {
    machineId: initial?.machineId ?? "",
    sourceAlertId: initial?.sourceAlertId ?? null,
    title: initial?.title ?? "",
    category: initial?.category ?? "BREAKDOWN_REPAIR",
    priority: "NORMAL",
    description: "",
    scheduledDate: "",
    notes: "",
    replacedParts: ""
  };
}

function emptyEvidenceDraft(): EvidenceDraft {
  return { type: "SERVICE_REPORT", fileName: "", fileUrl: "", notes: "" };
}

function emptyReplacementDraft(): ReplacementDraft {
  return {
    machinePartId: "",
    partName: "",
    partNumber: "",
    quantity: 1,
    unitCost: "",
    warrantyStart: "",
    warrantyEnd: "",
    nextReplacementDate: "",
    notes: ""
  };
}

function dateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function displayDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const dateOnly = value.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${dateOnly}T00:00:00`));
}

function displayCost(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "Not set";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", minimumFractionDigits: 2 }).format(amount);
}

function calculateTotals(workOrder: WorkOrder | null) {
  const serviceCost = Number(workOrder?.serviceCost ?? 0);
  const partsTotal = (workOrder?.replacements ?? []).reduce(
    (total, replacement) => total + replacement.quantity * Number(replacement.unitCost ?? 0),
    0
  );
  const finalTotal = Math.round((serviceCost + partsTotal) * 100) / 100;
  const proposedBudget = workOrder?.proposedBudget === null || workOrder?.proposedBudget === undefined
    ? null
    : Number(workOrder.proposedBudget);
  return {
    proposedBudget,
    serviceCost,
    partsTotal: Math.round(partsTotal * 100) / 100,
    finalTotal,
    variance: proposedBudget === null ? null : Math.round((finalTotal - proposedBudget) * 100) / 100
  };
}

function workOrderDraft(workOrder: WorkOrder): WorkOrderDraft {
  return {
    machineId: workOrder.machineId,
    sourceAlertId: workOrder.sourceAlertId ?? null,
    title: workOrder.title,
    category: workOrder.category,
    priority: workOrder.priority,
    description: workOrder.description ?? "",
    scheduledDate: dateInputValue(workOrder.scheduledDate),
    notes: workOrder.notes ?? "",
    replacedParts: workOrder.replacedParts ?? ""
  };
}

function workOrderPayload(draft: WorkOrderDraft): WorkOrderInput {
  return {
    machineId: draft.machineId,
    sourceAlertId: draft.sourceAlertId || null,
    title: draft.title.trim(),
    category: draft.category,
    priority: draft.priority,
    description: draft.description?.trim() || null,
    scheduledDate: draft.scheduledDate || null,
    notes: draft.notes?.trim() || null,
    replacedParts: draft.replacedParts?.trim() || null
  };
}

function serviceDetailsDraft(workOrder: WorkOrder): ServiceDetailsDraft {
  return {
    completedDate: dateInputValue(workOrder.completedDate),
    serviceCost: workOrder.serviceCost === null ? "" : String(workOrder.serviceCost),
    notes: workOrder.notes ?? "",
    providerBusinessName: workOrder.providerBusinessName ?? workOrder.provider?.name ?? "",
    providerAddress: workOrder.providerAddress ?? "",
    providerRegistrationNumber: workOrder.providerRegistrationNumber ?? "",
    providerContact: workOrder.providerContact ?? workOrder.provider?.email ?? "",
    invoiceNumber: workOrder.invoiceNumber ?? ""
  };
}

function nextAction(workOrder: WorkOrder, user: User) {
  switch (workOrder.status) {
    case "DRAFT": return "Submit the service request for management review.";
    case "PENDING_MANAGEMENT_APPROVAL": return "Management selects an active provider, then approves and dispatches the request.";
    case "SENT_TO_PROVIDER": return user.role === "SERVICE_PROVIDER" ? "Accept the assigned request." : "Waiting for the assigned provider to accept.";
    case "PROVIDER_ACCEPTED": return user.role === "SERVICE_PROVIDER" ? "Start the service work." : "The provider accepted and is ready to start.";
    case "IN_PROGRESS": return user.role === "SERVICE_PROVIDER" ? "Record service details, replacements and evidence, then submit completion." : "The provider is recording service completion details.";
    case "PRICE_REVISION_REQUESTED": return user.role === "SERVICE_PROVIDER" ? "Review management's counter message, revise the actual labour or part prices, then resubmit the receipt." : "Waiting for the provider to respond to the price counteroffer.";
    case "AWAITING_PAYMENT_APPROVAL": return "Management reviews the receipt and replacement details, then approves payment.";
    case "CLOSED": return "The request is closed and replacement dates have been applied to the asset register.";
    case "REJECTED": return workOrder.rejectionReason ? `Rejected: ${workOrder.rejectionReason}` : "This request was rejected.";
    case "CANCELLED": return "This request was cancelled.";
    default: return "Continue the legacy workflow for this existing request.";
  }
}

export function WorkOrderWorkspace({ user, initialRequest, onInitialRequestConsumed }: WorkOrderWorkspaceProps) {
  const canManage = user.role === "ADMIN" || user.role === "OWNER" || user.role === "MANAGER";
  const canCounterPayment = user.role === "OWNER" || user.role === "MANAGER";
  const canCreate = canManage || user.role === "MACHINE_OPERATOR";
  const isProvider = user.role === "SERVICE_PROVIDER";
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [providers, setProviders] = useState<WorkOrderProvider[]>([]);
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [machineContext, setMachineContext] = useState<Machine | null>(null);
  const [contextParts, setContextParts] = useState<MachinePart[]>([]);
  const [contextPlans, setContextPlans] = useState<MaintenancePlan[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "ALL">("ALL");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<WorkOrderEditor | null>(null);
  const [serviceDetailsEditor, setServiceDetailsEditor] = useState<ServiceDetailsDraft | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft>(emptyEvidenceDraft());
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [replacementDraft, setReplacementDraft] = useState<ReplacementDraft>(emptyReplacementDraft());
  const [showReplacementForm, setShowReplacementForm] = useState(false);
  const [editingReplacementId, setEditingReplacementId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("");
  const [proposedBudget, setProposedBudget] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [counterBudget, setCounterBudget] = useState("");
  const [counterReason, setCounterReason] = useState("");

  const loadRegister = useCallback(async (preferredId?: string) => {
    setLoadingList(true);
    setError("");
    try {
      const [workOrderResponse, machineResponse, providerResponse] = await Promise.all([
        getWorkOrders(),
        canCreate ? getMachines() : Promise.resolve({ machines: [] }),
        canManage ? getWorkOrderProviders() : Promise.resolve({ providers: [] })
      ]);
      setWorkOrders(workOrderResponse.workOrders);
      setMachines(machineResponse.machines);
      setProviders(providerResponse.providers.filter((provider) => provider.isActive));
      setSelectedId((current) => {
        const requested = preferredId ?? current;
        return requested && workOrderResponse.workOrders.some((item) => item.id === requested)
          ? requested
          : workOrderResponse.workOrders[0]?.id ?? null;
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load service requests");
    } finally {
      setLoadingList(false);
    }
  }, [canCreate, canManage]);

  useEffect(() => { void loadRegister(); }, [loadRegister]);

  useEffect(() => {
    getOrganizationProfile()
      .then((response) => setOrganization(response.profile))
      .catch(() => setOrganization(null));
  }, []);

  useEffect(() => {
    if (!initialRequest || !canCreate) return;
    setEditor({ mode: "create", draft: emptyWorkOrderDraft(initialRequest) });
    onInitialRequestConsumed?.();
  }, [canCreate, initialRequest, onInitialRequestConsumed]);

  useEffect(() => {
    setServiceDetailsEditor(null);
    setShowEvidenceForm(false);
    setShowReplacementForm(false);
    setEditingReplacementId(null);
    setEvidenceDraft(emptyEvidenceDraft());
    setReplacementDraft(emptyReplacementDraft());
    setProviderId("");
    setProposedBudget("");
    setPaymentReference("");
    setCounterBudget("");
    setCounterReason("");
    if (!selectedId) {
      setSelectedWorkOrder(null);
      setContextParts([]);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError("");
    getWorkOrder(selectedId)
      .then(async ({ workOrder }) => {
        if (cancelled) return;
        setSelectedWorkOrder(workOrder);
        setProviderId(workOrder.providerId ?? "");
        setProposedBudget(workOrder.proposedBudget === null ? "" : String(workOrder.proposedBudget));
        setPaymentReference(workOrder.paymentReference ?? "");
        setCounterBudget(workOrder.proposedBudget === null ? "" : String(workOrder.proposedBudget));
        if (isProvider) {
          setContextParts(workOrder.machine.parts ?? []);
        }
      })
      .catch((requestError: Error) => {
        if (!cancelled) {
          setSelectedWorkOrder(null);
          setError(requestError.message);
        }
      })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [isProvider, selectedId]);

  useEffect(() => {
    const machineId = editor?.draft.machineId;
    if (!machineId) {
      setMachineContext(null);
      setContextParts([]);
      setContextPlans([]);
      return;
    }
    let cancelled = false;
    Promise.all([getMachine(machineId), getMachineParts(machineId), getMaintenancePlans(machineId)])
      .then(([machineResponse, partsResponse, plansResponse]) => {
        if (cancelled) return;
        setMachineContext(machineResponse.machine);
        setContextParts(partsResponse.parts);
        setContextPlans(plansResponse.plans);
      })
      .catch((requestError: Error) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, [editor?.draft.machineId]);

  const visibleWorkOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workOrders.filter((workOrder) => {
      if (statusFilter !== "ALL" && workOrder.status !== statusFilter) return false;
      if (!normalized) return true;
      return [workOrder.title, workOrder.machine.assetCode, workOrder.machine.name, workOrder.machine.location, workOrder.provider?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    });
  }, [query, statusFilter, workOrders]);

  const summary = useMemo(() => ({
    total: workOrders.length,
    management: workOrders.filter((item) => item.status === "PENDING_MANAGEMENT_APPROVAL").length,
    payment: workOrders.filter((item) => item.status === "AWAITING_PAYMENT_APPROVAL").length,
    closed: workOrders.filter((item) => item.status === "CLOSED").length
  }), [workOrders]);

  const totals = useMemo(() => calculateTotals(selectedWorkOrder), [selectedWorkOrder]);
  const latestCounterOffer = selectedWorkOrder?.priceCounterOffers?.[0] ?? null;
  const providerCanRevise = isProvider && Boolean(selectedWorkOrder) && ["IN_PROGRESS", "PRICE_REVISION_REQUESTED"].includes(selectedWorkOrder!.status);

  function replaceWorkOrder(workOrder: WorkOrder) {
    setSelectedWorkOrder(workOrder);
    setProviderId(workOrder.providerId ?? "");
    setProposedBudget(workOrder.proposedBudget === null ? "" : String(workOrder.proposedBudget));
    setCounterBudget(workOrder.proposedBudget === null ? "" : String(workOrder.proposedBudget));
    setWorkOrders((current) => current.map((item) => item.id === workOrder.id ? workOrder : item));
  }

  async function refreshDetail(id: string) {
    const response = await getWorkOrder(id);
    replaceWorkOrder(response.workOrder);
  }

  async function saveWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError("");
    try {
      const response = editor.mode === "create"
        ? await createWorkOrder(workOrderPayload(editor.draft))
        : await updateWorkOrder(editor.workOrderId!, workOrderPayload(editor.draft));
      setEditor(null);
      await loadRegister(response.workOrder.id);
      replaceWorkOrder(response.workOrder);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save service request");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(label: string, action: () => Promise<{ workOrder: WorkOrder }>) {
    setBusyAction(label);
    setError("");
    try {
      const response = await action();
      replaceWorkOrder(response.workOrder);
      await loadRegister(response.workOrder.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to ${label.toLowerCase()}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveServiceDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkOrder || !serviceDetailsEditor) return;
    const input: WorkOrderServiceDetailsInput = {
      completedDate: serviceDetailsEditor.completedDate || null,
      serviceCost: serviceDetailsEditor.serviceCost === "" ? null : Number(serviceDetailsEditor.serviceCost),
      notes: serviceDetailsEditor.notes.trim() || null,
      providerBusinessName: serviceDetailsEditor.providerBusinessName.trim() || null,
      providerAddress: serviceDetailsEditor.providerAddress.trim() || null,
      providerRegistrationNumber: serviceDetailsEditor.providerRegistrationNumber.trim() || null,
      providerContact: serviceDetailsEditor.providerContact.trim() || null,
      invoiceNumber: serviceDetailsEditor.invoiceNumber.trim() || null
    };
    setSaving(true);
    setError("");
    try {
      const response = await updateWorkOrderServiceDetails(selectedWorkOrder.id, input);
      replaceWorkOrder(response.workOrder);
      setServiceDetailsEditor(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save service details");
    } finally {
      setSaving(false);
    }
  }

  async function saveEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkOrder) return;
    const input: ServiceEvidenceInput = {
      type: evidenceDraft.type,
      fileName: evidenceDraft.fileName.trim(),
      fileUrl: evidenceDraft.fileUrl.trim() || null,
      notes: evidenceDraft.notes.trim() || null
    };
    setSaving(true);
    setError("");
    try {
      await addWorkOrderEvidence(selectedWorkOrder.id, input);
      await refreshDetail(selectedWorkOrder.id);
      setEvidenceDraft(emptyEvidenceDraft());
      setShowEvidenceForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add evidence");
    } finally {
      setSaving(false);
    }
  }

  async function saveReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkOrder) return;
    const input: WorkOrderReplacementInput = {
      machinePartId: replacementDraft.machinePartId || null,
      partName: replacementDraft.partName.trim(),
      partNumber: replacementDraft.partNumber.trim() || null,
      quantity: replacementDraft.quantity,
      unitCost: replacementDraft.unitCost === "" ? null : Number(replacementDraft.unitCost),
      warrantyStart: replacementDraft.warrantyStart || null,
      warrantyEnd: replacementDraft.warrantyEnd || null,
      nextReplacementDate: replacementDraft.nextReplacementDate || null,
      notes: replacementDraft.notes.trim() || null
    };
    setSaving(true);
    setError("");
    try {
      if (editingReplacementId) {
        await updateWorkOrderReplacement(selectedWorkOrder.id, editingReplacementId, input);
      } else {
        await addWorkOrderReplacement(selectedWorkOrder.id, input);
      }
      await refreshDetail(selectedWorkOrder.id);
      setReplacementDraft(emptyReplacementDraft());
      setEditingReplacementId(null);
      setShowReplacementForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add replacement");
    } finally {
      setSaving(false);
    }
  }

  function selectExistingPart(partId: string) {
    const part = contextParts.find((item) => item.id === partId);
    setReplacementDraft((current) => ({
      ...current,
      machinePartId: partId,
      partName: part?.name ?? current.partName,
      partNumber: part?.partNumber ?? current.partNumber
    }));
  }

  function editReplacement(replacement: NonNullable<WorkOrder["replacements"]>[number]) {
    setEditingReplacementId(replacement.id);
    setReplacementDraft({
      machinePartId: replacement.machinePartId ?? "",
      partName: replacement.partName,
      partNumber: replacement.partNumber ?? "",
      quantity: replacement.quantity,
      unitCost: replacement.unitCost === null ? "" : String(replacement.unitCost),
      warrantyStart: dateInputValue(replacement.warrantyStart),
      warrantyEnd: dateInputValue(replacement.warrantyEnd),
      nextReplacementDate: dateInputValue(replacement.nextReplacementDate),
      notes: replacement.notes ?? ""
    });
    setShowReplacementForm(true);
  }

  async function removeReplacement(replacementId: string) {
    if (!selectedWorkOrder || !window.confirm("Remove this replacement line?")) return;
    setBusyAction("Remove replacement");
    try {
      await deleteWorkOrderReplacement(selectedWorkOrder.id, replacementId);
      await refreshDetail(selectedWorkOrder.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to remove replacement");
    } finally {
      setBusyAction(null);
    }
  }

  async function rejectSelected() {
    if (!selectedWorkOrder) return;
    const reason = window.prompt("Reason for rejection (optional)");
    if (reason === null) return;
    await runAction("Reject request", () => rejectWorkOrder(selectedWorkOrder.id, reason));
  }

  const selectedStep = selectedWorkOrder
    ? workflowSteps.findIndex((step) => step.status === (
      selectedWorkOrder.status === "PRICE_REVISION_REQUESTED" ? "IN_PROGRESS" : selectedWorkOrder.status
    ))
    : -1;

  return (
    <section className="work-order-workspace" aria-labelledby="work-orders-heading">
      <div className="workspace-heading">
        <div><p className="eyebrow">Service workflow</p><h1 id="work-orders-heading">Service requests</h1><p className="muted">Track each request from operator report through provider service and payment closure.</p></div>
        <div className="workspace-heading-actions"><button className="secondary-button button-with-icon" type="button" onClick={() => void loadRegister()} disabled={loadingList}><RefreshCw aria-hidden="true" /> Refresh</button>{canCreate && <button className="primary-button button-with-icon" type="button" onClick={() => setEditor({ mode: "create", draft: emptyWorkOrderDraft() })}><Plus aria-hidden="true" /> New service request</button>}</div>
      </div>
      {error && <p className="form-error workspace-error" role="alert">{error}</p>}

      <div className="work-order-summary">
        <article><ClipboardList aria-hidden="true" /><div><strong>{summary.total}</strong><span>Total requests</span></div></article>
        <article><ClipboardCheck aria-hidden="true" /><div><strong>{summary.management}</strong><span>Management review</span></div></article>
        <article><FileText aria-hidden="true" /><div><strong>{summary.payment}</strong><span>Payment review</span></div></article>
        <article><CheckCircle2 aria-hidden="true" /><div><strong>{summary.closed}</strong><span>Closed</span></div></article>
      </div>

      <div className="work-order-layout">
        <aside className="work-order-index" aria-label="Service request list">
          <div className="work-order-filters"><label className="search-field"><span className="sr-only">Search requests</span><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests..." /></label><label><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as WorkOrderStatus | "ALL")}><option value="ALL">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label></div>
          <div className="index-summary"><strong>{visibleWorkOrders.length}</strong> of {workOrders.length} requests</div>
          {loadingList ? <div className="workspace-state"><span className="loading-mark small" />Loading requests...</div> : visibleWorkOrders.length === 0 ? <div className="workspace-state"><ClipboardList aria-hidden="true" /><strong>No service requests</strong><span>{canCreate ? "Create a request from an alert or start one here." : "No assigned requests are available."}</span></div> : <div className="work-order-list">{visibleWorkOrders.map((workOrder) => <button className={`work-order-list-item${selectedId === workOrder.id ? " selected" : ""}`} key={workOrder.id} type="button" onClick={() => setSelectedId(workOrder.id)}><span className="work-order-list-top"><strong>{workOrder.machine.assetCode}</strong><span className={`work-order-status status-${workOrder.status.toLowerCase()}`}>{statusLabels[workOrder.status]}</span></span><span className="work-order-title">{workOrder.title}</span><span className="work-order-meta"><MapPin aria-hidden="true" />{workOrder.machine.location}{workOrder.provider ? ` | ${workOrder.provider.name}` : ""}</span></button>)}</div>}
        </aside>

        <div className="work-order-detail">
          {loadingDetail ? <div className="workspace-state detail-state"><span className="loading-mark" />Loading service request...</div> : !selectedWorkOrder ? <div className="workspace-state detail-state"><ClipboardList aria-hidden="true" /><strong>Select a request</strong><span>Workflow, assignment, service details and evidence will appear here.</span></div> : <div className="printable-section">
            <section className="receipt-identity">
              <div className="receipt-brand">
                <p>Service completion receipt</p>
                <h2>{organization?.companyName ?? "Maintenance Report System"}</h2>
                {organization?.address && <span>{organization.address}</span>}
                <span>{[
                  organization?.registrationNumber ? `Registration: ${organization.registrationNumber}` : null,
                  organization?.phone,
                  organization?.email
                ].filter(Boolean).join(" | ") || "Organization contact details pending administrator setup"}</span>
              </div>
              <dl>
                <div><dt>Receipt / invoice</dt><dd>{selectedWorkOrder.invoiceNumber ?? "Not assigned"}</dd></div>
                <div><dt>Request reference</dt><dd>{selectedWorkOrder.id.slice(0, 8).toUpperCase()}</dd></div>
                <div><dt>Service provider</dt><dd>{selectedWorkOrder.providerBusinessName ?? selectedWorkOrder.provider?.name ?? "Not assigned"}</dd></div>
                <div><dt>Provider registration</dt><dd>{selectedWorkOrder.providerRegistrationNumber ?? "Not provided"}</dd></div>
              </dl>
            </section>
            <header className="work-order-header"><div><div className="machine-title-line"><span className="asset-code">{selectedWorkOrder.machine.assetCode}</span><span className={`work-order-status status-${selectedWorkOrder.status.toLowerCase()}`}>{statusLabels[selectedWorkOrder.status]}</span></div><h2>{selectedWorkOrder.title}</h2><p>{selectedWorkOrder.machine.name} | {selectedWorkOrder.machine.location}</p></div><div className="row-actions no-print">{selectedWorkOrder.status === "DRAFT" && canCreate && <button className="secondary-button button-with-icon" type="button" onClick={() => setEditor({ mode: "edit", workOrderId: selectedWorkOrder.id, draft: workOrderDraft(selectedWorkOrder) })}><Pencil aria-hidden="true" /> Edit</button>}{["IN_PROGRESS", "PRICE_REVISION_REQUESTED", "AWAITING_PAYMENT_APPROVAL", "CLOSED"].includes(selectedWorkOrder.status) && <button className="secondary-button button-with-icon" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Print service slip</button>}{canManage && !["CLOSED", "REJECTED", "CANCELLED"].includes(selectedWorkOrder.status) && <button className="danger-icon-button" type="button" onClick={() => void runAction("Cancel", () => cancelWorkOrder(selectedWorkOrder.id))} title="Cancel request" aria-label="Cancel request"><XCircle aria-hidden="true" /></button>}</div></header>

            <ol className="workflow-stepper" aria-label="Service request progress">{workflowSteps.map((step, index) => { const isCurrent = step.status === selectedWorkOrder.status || (selectedWorkOrder.status === "PRICE_REVISION_REQUESTED" && step.status === "IN_PROGRESS"); const isDone = selectedStep >= 0 && index < selectedStep; return <li className={isCurrent ? "current" : isDone ? "done" : ""} key={step.status}><span>{isDone ? "✓" : index + 1}</span><strong>{step.label}</strong></li>; })}</ol>

            <section className="next-action-panel"><div><p className="eyebrow">Next action</p><strong>{nextAction(selectedWorkOrder, user)}</strong></div><div className="next-action-buttons no-print">{selectedWorkOrder.status === "DRAFT" && canCreate && <button className="primary-button button-with-icon" type="button" onClick={() => void runAction("Submit request", () => submitWorkOrder(selectedWorkOrder.id))} disabled={Boolean(busyAction)}><Send aria-hidden="true" /> Submit for review</button>}{selectedWorkOrder.status === "SENT_TO_PROVIDER" && isProvider && <button className="primary-button button-with-icon" type="button" onClick={() => void runAction("Accept request", () => acceptWorkOrder(selectedWorkOrder.id))} disabled={Boolean(busyAction)}><CheckCircle2 aria-hidden="true" /> Accept request</button>}{selectedWorkOrder.status === "PROVIDER_ACCEPTED" && isProvider && <button className="primary-button button-with-icon" type="button" onClick={() => void runAction("Start work", () => startWorkOrder(selectedWorkOrder.id))} disabled={Boolean(busyAction)}><Play aria-hidden="true" /> Start work</button>}{providerCanRevise && <button className="primary-button button-with-icon" type="button" onClick={() => void runAction(selectedWorkOrder.status === "PRICE_REVISION_REQUESTED" ? "Resubmit revised receipt" : "Submit completion", () => submitWorkOrderCompletion(selectedWorkOrder.id))} disabled={Boolean(busyAction)}><Send aria-hidden="true" /> {selectedWorkOrder.status === "PRICE_REVISION_REQUESTED" ? "Resubmit revised receipt" : "Submit completion"}</button>}</div></section>

            {canManage && <section className="provider-readiness no-print"><div className="section-heading compact"><div><p className="eyebrow">Management dispatch</p><h3>Provider assignment and proposed budget</h3></div></div>{providers.length === 0 ? <p className="inline-warning"><AlertCircle aria-hidden="true" /> No active service providers are available. An administrator must activate or create one before dispatch.</p> : <div className="management-action-row"><label>Assigned provider<select value={providerId} onChange={(event) => setProviderId(event.target.value)} disabled={selectedWorkOrder.status !== "PENDING_MANAGEMENT_APPROVAL"}><option value="">Select an active provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.email})</option>)}</select></label><label>Proposed budget (LKR)<input type="number" min={0} step="0.01" value={proposedBudget} onChange={(event) => setProposedBudget(event.target.value)} disabled={selectedWorkOrder.status !== "PENDING_MANAGEMENT_APPROVAL"} required /></label>{selectedWorkOrder.status === "PENDING_MANAGEMENT_APPROVAL" && <><button className="secondary-button" type="button" onClick={() => void rejectSelected()} disabled={Boolean(busyAction)}>Reject</button><button className="primary-button button-with-icon" type="button" onClick={() => void runAction("Approve and dispatch", () => approveAndDispatchWorkOrder(selectedWorkOrder.id, providerId, Number(proposedBudget)))} disabled={!providerId || proposedBudget === "" || Boolean(busyAction)}><Send aria-hidden="true" /> Approve and send</button></>}</div>}{selectedWorkOrder.provider && <p className="assignment-summary"><UserRound aria-hidden="true" /> Assigned to <strong>{selectedWorkOrder.provider.name}</strong> ({selectedWorkOrder.provider.email}) with a proposed budget of <strong>{displayCost(selectedWorkOrder.proposedBudget)}</strong>.</p>}</section>}

            {canManage && selectedWorkOrder.status === "AWAITING_PAYMENT_APPROVAL" && <section className="payment-review no-print">
              <div className="payment-review-heading"><p className="eyebrow">Final approval</p><h3>Accept or counter the provider receipt</h3><p>Final provider total: <strong>{displayCost(totals.finalTotal)}</strong>{totals.variance !== null ? ` (${totals.variance > 0 ? "over" : "under"} the current budget by ${displayCost(Math.abs(totals.variance))})` : ""}. A counter budget is a negotiation target; the provider's revised total does not have to equal it.</p></div>
              <div className="payment-approval-action"><label>Payment reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={150} placeholder="Invoice or transaction reference" /></label><button className="primary-button button-with-icon" type="button" onClick={() => void runAction("Approve payment", () => approveWorkOrderPayment(selectedWorkOrder.id, paymentReference))} disabled={Boolean(busyAction)}><CheckCircle2 aria-hidden="true" /> Approve payment and close</button></div>
              {canCounterPayment && <div className="counter-offer-form"><label>Counter budget (LKR)<input type="number" min={0} step="0.01" value={counterBudget} onChange={(event) => setCounterBudget(event.target.value)} required /></label><label>Reason / message<textarea value={counterReason} onChange={(event) => setCounterReason(event.target.value)} rows={3} maxLength={2000} placeholder="Explain which labour or part prices should be reviewed" required /></label><button className="secondary-button button-with-icon" type="button" onClick={() => void runAction("Send counteroffer", async () => { const response = await counterWorkOrderPayment(selectedWorkOrder.id, Number(counterBudget), counterReason); setCounterReason(""); return response; })} disabled={counterBudget === "" || !counterReason.trim() || Boolean(busyAction)}><MessageSquareReply aria-hidden="true" /> Counter and request revision</button></div>}
            </section>}

            {latestCounterOffer && <section className={`counter-message${selectedWorkOrder.status === "PRICE_REVISION_REQUESTED" ? " active" : ""}`}>
              <div><p className="eyebrow">Latest price counteroffer</p><h3>{displayCost(latestCounterOffer.counterBudget)} proposed by {latestCounterOffer.createdBy.name}</h3><p>{latestCounterOffer.reason}</p></div>
              <dl><div><dt>Provider total reviewed</dt><dd>{displayCost(latestCounterOffer.reviewedTotal)}</dd></div><div><dt>Sent</dt><dd>{displayDate(latestCounterOffer.createdAt)}</dd></div><div><dt>Provider response</dt><dd>{latestCounterOffer.respondedAt ? `Resubmitted ${displayDate(latestCounterOffer.respondedAt)}` : "Revision pending"}</dd></div></dl>
              {selectedWorkOrder.status === "PRICE_REVISION_REQUESTED" && isProvider && <p className="counter-guidance"><AlertCircle aria-hidden="true" /> Adjust the real labour charge or part quantity/unit prices where appropriate. Your revised total may be above or below the counter budget, but it should reflect the corrected receipt.</p>}
            </section>}
            {(selectedWorkOrder.priceCounterOffers?.length ?? 0) > 1 && <details className="counter-history"><summary>View {selectedWorkOrder.priceCounterOffers!.length - 1} previous counteroffer{selectedWorkOrder.priceCounterOffers!.length === 2 ? "" : "s"}</summary><div>{selectedWorkOrder.priceCounterOffers!.slice(1).map((offer) => <article key={offer.id}><strong>{displayCost(offer.counterBudget)} by {offer.createdBy.name}</strong><span>{displayDate(offer.createdAt)} | reviewed total {displayCost(offer.reviewedTotal)}</span><p>{offer.reason}</p></article>)}</div></details>}

            <section className="cost-summary" aria-label="Cost summary"><article><span>Proposed budget</span><strong>{displayCost(totals.proposedBudget)}</strong></article><article><span>Parts total</span><strong>{displayCost(totals.partsTotal)}</strong></article><article><span>Service / labour</span><strong>{displayCost(totals.serviceCost)}</strong></article><article className="cost-summary-total"><span>{["AWAITING_PAYMENT_APPROVAL", "CLOSED"].includes(selectedWorkOrder.status) ? "Final total" : "Current total"}</span><strong>{displayCost(totals.finalTotal)}</strong>{totals.variance !== null && <small className={totals.variance > 0 ? "over-budget" : "within-budget"}>{totals.variance > 0 ? `${displayCost(totals.variance)} over budget` : `${displayCost(Math.abs(totals.variance))} within budget`}</small>}</article></section>

            <dl className="work-order-facts"><div><dt>Category</dt><dd>{categoryLabels[selectedWorkOrder.category]}</dd></div><div><dt>Priority</dt><dd>{priorityLabels[selectedWorkOrder.priority]}</dd></div><div><dt>Scheduled date</dt><dd>{displayDate(selectedWorkOrder.scheduledDate)}</dd></div><div><dt>Provider</dt><dd>{selectedWorkOrder.provider?.name ?? "Not assigned"}</dd></div><div><dt>Completed date</dt><dd>{displayDate(selectedWorkOrder.completedDate)}</dd></div><div><dt>Created by</dt><dd>{selectedWorkOrder.createdBy?.name ?? selectedWorkOrder.machine.operator?.name ?? "Management"}</dd></div><div><dt>Source alert</dt><dd>{selectedWorkOrder.sourceAlert ? `${selectedWorkOrder.sourceAlert.type.replaceAll("_", " ")} | ${displayDate(selectedWorkOrder.sourceAlert.dueDate)}` : "Manual request"}</dd></div><div><dt>Invoice</dt><dd>{selectedWorkOrder.invoiceNumber ?? "Pending"}</dd></div><div><dt>Payment approval</dt><dd>{selectedWorkOrder.paymentApprovedBy ? `${selectedWorkOrder.paymentApprovedBy.name}${selectedWorkOrder.paymentReference ? ` | ${selectedWorkOrder.paymentReference}` : ""}` : "Pending"}</dd></div></dl>
            {(selectedWorkOrder.description || selectedWorkOrder.notes) && <section className="work-order-copy"><h3>Request details</h3>{selectedWorkOrder.description && <p>{selectedWorkOrder.description}</p>}{selectedWorkOrder.notes && <p><strong>Service notes:</strong> {selectedWorkOrder.notes}</p>}</section>}

            <section className="record-section" aria-labelledby="replacement-heading"><div className="section-heading compact"><div><p className="eyebrow">Parts and warranty</p><h3 id="replacement-heading">Replacement lines</h3></div>{providerCanRevise && <button className="secondary-button button-with-icon no-print" type="button" onClick={() => { setEditingReplacementId(null); setReplacementDraft(emptyReplacementDraft()); setShowReplacementForm((value) => !value); }}><Plus aria-hidden="true" /> Add replacement</button>}</div>
              {showReplacementForm && <form className="replacement-form no-print" onSubmit={saveReplacement}><label className="form-span">Existing machine part<select value={replacementDraft.machinePartId} onChange={(event) => selectExistingPart(event.target.value)}><option value="">New or unlisted part</option>{contextParts.map((part) => <option key={part.id} value={part.id}>{part.name}{part.partNumber ? ` (${part.partNumber})` : ""}</option>)}</select></label><label>Part name<input value={replacementDraft.partName} onChange={(event) => setReplacementDraft({ ...replacementDraft, partName: event.target.value })} required maxLength={120} /></label><label>Part number<input value={replacementDraft.partNumber} onChange={(event) => setReplacementDraft({ ...replacementDraft, partNumber: event.target.value })} maxLength={100} /></label><label>Quantity<input type="number" min={1} value={replacementDraft.quantity} onChange={(event) => setReplacementDraft({ ...replacementDraft, quantity: Number(event.target.value) })} required /></label><label>Unit cost (LKR)<input type="number" min={0} step="0.01" value={replacementDraft.unitCost} onChange={(event) => setReplacementDraft({ ...replacementDraft, unitCost: event.target.value })} required /></label><label>Warranty start<input type="date" value={replacementDraft.warrantyStart} onChange={(event) => setReplacementDraft({ ...replacementDraft, warrantyStart: event.target.value })} /></label><label>Warranty end<input type="date" min={replacementDraft.warrantyStart || undefined} value={replacementDraft.warrantyEnd} onChange={(event) => setReplacementDraft({ ...replacementDraft, warrantyEnd: event.target.value })} /></label><label>Next replacement date<input type="date" value={replacementDraft.nextReplacementDate} onChange={(event) => setReplacementDraft({ ...replacementDraft, nextReplacementDate: event.target.value })} /></label><label className="form-span">Notes<textarea value={replacementDraft.notes} onChange={(event) => setReplacementDraft({ ...replacementDraft, notes: event.target.value })} rows={2} maxLength={2000} /></label><div className="editor-actions form-span"><button className="secondary-button" type="button" onClick={() => { setShowReplacementForm(false); setEditingReplacementId(null); setReplacementDraft(emptyReplacementDraft()); }}>Cancel</button><button className="primary-button button-with-icon" type="submit" disabled={saving}><Save aria-hidden="true" /> {editingReplacementId ? "Update replacement" : "Save replacement"}</button></div></form>}
              {!selectedWorkOrder.replacements?.length ? <div className="empty-row"><Wrench aria-hidden="true" /><span>No replaced parts recorded.</span></div> : <div className="data-table-wrap"><table className="data-table replacement-table"><thead><tr><th>Part</th><th>Quantity</th><th>Unit cost</th><th>Line total</th><th>Warranty end</th><th>Next replacement</th>{providerCanRevise && <th className="no-print"><span className="sr-only">Actions</span></th>}</tr></thead><tbody>{selectedWorkOrder.replacements.map((replacement) => <tr key={replacement.id}><td><strong>{replacement.partName}</strong><span>{replacement.partNumber ?? "No part number"}</span></td><td>{replacement.quantity}</td><td>{displayCost(replacement.unitCost)}</td><td><strong>{displayCost(replacement.quantity * Number(replacement.unitCost ?? 0))}</strong></td><td>{displayDate(replacement.warrantyEnd)}</td><td>{displayDate(replacement.nextReplacementDate)}</td>{providerCanRevise && <td className="no-print"><div className="row-actions"><button className="table-icon-button" type="button" onClick={() => editReplacement(replacement)} title="Edit replacement" aria-label={`Edit ${replacement.partName}`}><Pencil aria-hidden="true" /></button><button className="table-icon-button danger" type="button" onClick={() => void removeReplacement(replacement.id)} title="Remove replacement" aria-label={`Remove ${replacement.partName}`}><Trash2 aria-hidden="true" /></button></div></td>}</tr>)}</tbody></table></div>}
            </section>

            <section className="record-section" aria-labelledby="service-details-heading"><div className="section-heading compact"><div><p className="eyebrow">Provider report</p><h3 id="service-details-heading">Service and receipt details</h3></div>{isProvider && ["PROVIDER_ACCEPTED", "IN_PROGRESS", "PRICE_REVISION_REQUESTED"].includes(selectedWorkOrder.status) && <button className="secondary-button button-with-icon no-print" type="button" onClick={() => setServiceDetailsEditor(serviceDetailsDraft(selectedWorkOrder))}><Pencil aria-hidden="true" /> Edit details</button>}</div><div className="service-details-grid"><div><span>Completed date</span><strong>{displayDate(selectedWorkOrder.completedDate)}</strong></div><div><span>Service / labour charge</span><strong>{displayCost(selectedWorkOrder.serviceCost)}</strong></div><div><span>Parts total</span><strong>{displayCost(totals.partsTotal)}</strong></div><div><span>Final total</span><strong>{displayCost(totals.finalTotal)}</strong></div><div><span>Provider business</span><strong>{selectedWorkOrder.providerBusinessName ?? selectedWorkOrder.provider?.name ?? "Not provided"}</strong></div><div><span>Registration number</span><strong>{selectedWorkOrder.providerRegistrationNumber ?? "Not provided"}</strong></div><div><span>Provider address</span><strong>{selectedWorkOrder.providerAddress ?? "Not provided"}</strong></div><div><span>Provider contact</span><strong>{selectedWorkOrder.providerContact ?? selectedWorkOrder.provider?.email ?? "Not provided"}</strong></div><div><span>Invoice number</span><strong>{selectedWorkOrder.invoiceNumber ?? "Not provided"}</strong></div><div><span>Notes</span><strong>{selectedWorkOrder.notes ?? "No service notes recorded"}</strong></div></div></section>

            <section className="record-section" aria-labelledby="evidence-heading"><div className="section-heading compact"><div><p className="eyebrow">Documents</p><h3 id="evidence-heading">Evidence and receipts</h3></div>{providerCanRevise && <button className="secondary-button button-with-icon no-print" type="button" onClick={() => setShowEvidenceForm((value) => !value)}><FilePlus2 aria-hidden="true" /> Add evidence</button>}</div>{showEvidenceForm && <form className="evidence-form no-print" onSubmit={saveEvidence}><label>Evidence type<select value={evidenceDraft.type} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, type: event.target.value as EvidenceType })}>{evidenceTypes.map((type) => <option key={type} value={type}>{evidenceLabels[type]}</option>)}</select></label><label>File name<input value={evidenceDraft.fileName} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, fileName: event.target.value })} required maxLength={255} /></label><label className="form-span">File URL or path<input value={evidenceDraft.fileUrl} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, fileUrl: event.target.value })} placeholder="https://... or /files/..." /></label><label className="form-span">Notes<textarea value={evidenceDraft.notes} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, notes: event.target.value })} rows={2} /></label><div className="editor-actions form-span"><button className="secondary-button" type="button" onClick={() => setShowEvidenceForm(false)}>Cancel</button><button className="primary-button button-with-icon" type="submit" disabled={saving}><Save aria-hidden="true" /> Save evidence</button></div></form>}{!selectedWorkOrder.evidence.length ? <div className="empty-row"><FileText aria-hidden="true" /><span>No evidence or receipts recorded.</span></div> : <div className="evidence-list">{selectedWorkOrder.evidence.map((evidence) => <article key={evidence.id}><FileText aria-hidden="true" /><div><strong>{evidence.fileName}</strong><span>{evidenceLabels[evidence.type]} | {displayDate(evidence.createdAt)}</span>{evidence.notes && <p>{evidence.notes}</p>}</div>{evidence.fileUrl && <a href={evidence.fileUrl} target="_blank" rel="noreferrer">Open</a>}</article>)}</div>}</section>
          </div>}
        </div>
      </div>

      {editor && <section className="editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="request-editor-heading"><form className="record-editor" onSubmit={saveWorkOrder}><EditorHeading id="request-editor-heading" title={editor.mode === "create" ? "Create service request" : "Edit service request"} onClose={() => setEditor(null)} /><div className="form-grid"><label className="form-span">Machine<select value={editor.draft.machineId} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, machineId: event.target.value } })} required><option value="">Select a machine</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.assetCode} | {machine.name} | {machine.location}</option>)}</select></label><label>Category<select value={editor.draft.category} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, category: event.target.value as WorkOrderCategory } })}>{categories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label><label>Priority<select value={editor.draft.priority} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, priority: event.target.value as WorkOrderPriority } })}>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label><label className="form-span">Request title<input value={editor.draft.title} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, title: event.target.value } })} required maxLength={150} /></label><label className="form-span">Problem description<textarea value={editor.draft.description ?? ""} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, description: event.target.value } })} rows={4} maxLength={5000} /></label><label>Preferred service date<input type="date" value={editor.draft.scheduledDate} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, scheduledDate: event.target.value } })} /></label><label className="form-span">Additional notes<textarea value={editor.draft.notes ?? ""} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, notes: event.target.value } })} rows={3} maxLength={5000} /></label></div>{machineContext && <section className="machine-context"><div><p className="eyebrow">Selected machine</p><h3>{machineContext.assetCode} | {machineContext.name}</h3><p><MapPin aria-hidden="true" /> {machineContext.location} | {machineContext.category} | {machineContext.status.replaceAll("_", " ")}</p></div><dl><div><dt>Operator</dt><dd>{machineContext.operator?.name ?? "Unassigned"}</dd></div><div><dt>Parts</dt><dd>{contextParts.length}</dd></div><div><dt>Active plans</dt><dd>{contextPlans.filter((plan) => plan.isActive).length}</dd></div></dl>{contextParts.length > 0 && <div className="context-due-list"><strong>Part dates</strong>{contextParts.map((part) => <span key={part.id}>{part.name}: warranty {displayDate(part.warrantyEnd)}, replacement {displayDate(part.replacementDue)}</span>)}</div>}{contextPlans.length > 0 && <div className="context-due-list"><strong>Maintenance dates</strong>{contextPlans.map((plan) => <span key={plan.id}>{plan.title}: {displayDate(plan.nextDueDate)}</span>)}</div>}</section>}{editor.draft.sourceAlertId && <p className="permission-note"><AlertCircle aria-hidden="true" /> This request is linked to the selected maintenance alert.</p>}<EditorActions saving={saving} onCancel={() => setEditor(null)} /></form></section>}

      {serviceDetailsEditor && <section className="editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="service-editor-heading"><form className="record-editor" onSubmit={saveServiceDetails}><EditorHeading id="service-editor-heading" title="Service and receipt details" onClose={() => setServiceDetailsEditor(null)} /><div className="form-grid"><label>Completed date<input type="date" value={serviceDetailsEditor.completedDate} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, completedDate: event.target.value })} /></label><label>Service / labour charge (LKR)<input type="number" min={0} step="0.01" value={serviceDetailsEditor.serviceCost} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, serviceCost: event.target.value })} required /></label><label>Provider business name<input value={serviceDetailsEditor.providerBusinessName} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, providerBusinessName: event.target.value })} maxLength={180} /></label><label>Provider registration number<input value={serviceDetailsEditor.providerRegistrationNumber} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, providerRegistrationNumber: event.target.value })} maxLength={120} /></label><label className="form-span">Provider address<textarea value={serviceDetailsEditor.providerAddress} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, providerAddress: event.target.value })} rows={3} maxLength={500} /></label><label>Provider contact<input value={serviceDetailsEditor.providerContact} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, providerContact: event.target.value })} maxLength={180} /></label><label>Invoice / receipt number<input value={serviceDetailsEditor.invoiceNumber} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, invoiceNumber: event.target.value })} maxLength={120} /></label><label className="form-span">Service notes<textarea value={serviceDetailsEditor.notes} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, notes: event.target.value })} rows={5} maxLength={5000} /></label></div><p className="permission-note"><AlertCircle aria-hidden="true" /> Parts are totalled automatically from the replacement lines. The final total is the service/labour charge plus all part line totals.</p><EditorActions saving={saving} onCancel={() => setServiceDetailsEditor(null)} /></form></section>}
    </section>
  );
}

function EditorHeading({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return <div className="editor-heading"><div><p className="eyebrow">Service workflow</p><h2 id={id}>{title}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Close editor"><X aria-hidden="true" /></button></div>;
}

function EditorActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return <div className="editor-actions"><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button button-with-icon" type="submit" disabled={saving}><Save aria-hidden="true" />{saving ? "Saving..." : "Save"}</button></div>;
}
