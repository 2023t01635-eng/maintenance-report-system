import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  MapPin,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  UserRound,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addWorkOrderEvidence,
  approveWorkOrder,
  cancelWorkOrder,
  completeWorkOrder,
  createWorkOrder,
  getMachines,
  getWorkOrder,
  getWorkOrderProviders,
  getWorkOrders,
  sendWorkOrderToProvider,
  startWorkOrder,
  submitWorkOrder,
  updateWorkOrder,
  updateWorkOrderServiceDetails,
  type EvidenceType,
  type Machine,
  type ServiceEvidenceInput,
  type User,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderProvider,
  type WorkOrderServiceDetailsInput,
  type WorkOrderStatus
} from "../services/api";

type WorkOrderWorkspaceProps = {
  user: User;
};

type WorkOrderDraft = Omit<WorkOrderInput, "scheduledDate" | "cost"> & {
  scheduledDate: string;
  cost: string;
};

type WorkOrderEditor = {
  mode: "create" | "edit";
  workOrderId?: string;
  draft: WorkOrderDraft;
};

type EvidenceDraft = {
  type: EvidenceType;
  fileName: string;
  fileUrl: string;
  notes: string;
};

type ServiceDetailsDraft = {
  completedDate: string;
  cost: string;
  replacedParts: string;
  notes: string;
};

const statusLabels: Record<WorkOrderStatus, string> = {
  DRAFT: "Draft",
  PENDING_OPERATOR_APPROVAL: "Pending operator approval",
  APPROVED: "Approved",
  SENT_TO_PROVIDER: "Sent to provider",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled"
};

const evidenceLabels: Record<EvidenceType, string> = {
  SERVICE_REPORT: "Service report",
  INVOICE: "Invoice",
  PAYMENT_SLIP: "Payment slip",
  PHOTO: "Photo",
  OTHER: "Other"
};

const statuses = Object.keys(statusLabels) as WorkOrderStatus[];
const evidenceTypes = Object.keys(evidenceLabels) as EvidenceType[];

function emptyWorkOrderDraft(): WorkOrderDraft {
  return {
    machineId: "",
    title: "",
    description: "",
    scheduledDate: "",
    cost: "",
    notes: "",
    replacedParts: ""
  };
}

function emptyEvidenceDraft(): EvidenceDraft {
  return { type: "SERVICE_REPORT", fileName: "", fileUrl: "", notes: "" };
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

function displayCost(value: WorkOrder["cost"]) {
  if (value === null || value === "") return "Not set";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", minimumFractionDigits: 2 }).format(amount);
}

function workOrderDraft(workOrder: WorkOrder): WorkOrderDraft {
  return {
    machineId: workOrder.machineId,
    title: workOrder.title,
    description: workOrder.description ?? "",
    scheduledDate: dateInputValue(workOrder.scheduledDate),
    cost: workOrder.cost === null ? "" : String(workOrder.cost),
    notes: workOrder.notes ?? "",
    replacedParts: workOrder.replacedParts ?? ""
  };
}

function workOrderPayload(draft: WorkOrderDraft): WorkOrderInput {
  return {
    machineId: draft.machineId,
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    scheduledDate: draft.scheduledDate || null,
    cost: draft.cost === "" ? null : Number(draft.cost),
    notes: draft.notes?.trim() || null,
    replacedParts: draft.replacedParts?.trim() || null
  };
}

function evidencePayload(draft: EvidenceDraft): ServiceEvidenceInput {
  return {
    type: draft.type,
    fileName: draft.fileName.trim(),
    fileUrl: draft.fileUrl.trim() || null,
    notes: draft.notes.trim() || null
  };
}

function serviceDetailsDraft(workOrder: WorkOrder): ServiceDetailsDraft {
  return {
    completedDate: dateInputValue(workOrder.completedDate),
    cost: workOrder.cost === null ? "" : String(workOrder.cost),
    replacedParts: workOrder.replacedParts ?? "",
    notes: workOrder.notes ?? ""
  };
}

function serviceDetailsPayload(draft: ServiceDetailsDraft): WorkOrderServiceDetailsInput {
  return {
    completedDate: draft.completedDate || null,
    cost: draft.cost === "" ? null : Number(draft.cost),
    replacedParts: draft.replacedParts.trim() || null,
    notes: draft.notes.trim() || null
  };
}

export function WorkOrderWorkspace({ user }: WorkOrderWorkspaceProps) {
  const canManage = user.role === "ADMIN" || user.role === "OWNER" || user.role === "MANAGER";
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [providers, setProviders] = useState<WorkOrderProvider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "ALL">("ALL");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<WorkOrderEditor | null>(null);
  const [serviceDetailsEditor, setServiceDetailsEditor] = useState<ServiceDetailsDraft | null>(null);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft>(emptyEvidenceDraft());
  const [providerId, setProviderId] = useState("");

  const loadRegister = useCallback(async (preferredId?: string) => {
    setLoadingList(true);
    setError("");
    try {
      const [workOrderResponse, machineResponse, providerResponse] = await Promise.all([
        getWorkOrders(),
        canManage ? getMachines() : Promise.resolve({ machines: [] }),
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
      setError(requestError instanceof Error ? requestError.message : "Unable to load work orders");
    } finally {
      setLoadingList(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  useEffect(() => {
    setEditor(null);
    setServiceDetailsEditor(null);
    setShowEvidenceForm(false);
    setEvidenceDraft(emptyEvidenceDraft());
    setProviderId("");

    if (!selectedId) {
      setSelectedWorkOrder(null);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setError("");
    getWorkOrder(selectedId)
      .then(({ workOrder }) => {
        if (!cancelled) {
          setSelectedWorkOrder(workOrder);
          setProviderId(workOrder.providerId ?? "");
        }
      })
      .catch((requestError: Error) => {
        if (!cancelled) {
          setSelectedWorkOrder(null);
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const visibleWorkOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workOrders.filter((workOrder) => {
      if (statusFilter !== "ALL" && workOrder.status !== statusFilter) return false;
      if (!normalized) return true;
      return [
        workOrder.title,
        workOrder.machine.assetCode,
        workOrder.machine.name,
        workOrder.machine.location,
        workOrder.provider?.name
      ].filter(Boolean).some((value) => value!.toLowerCase().includes(normalized));
    });
  }, [query, statusFilter, workOrders]);

  const summary = useMemo(() => ({
    total: workOrders.length,
    pending: workOrders.filter((item) => item.status === "PENDING_OPERATOR_APPROVAL").length,
    active: workOrders.filter((item) => ["APPROVED", "SENT_TO_PROVIDER", "IN_PROGRESS"].includes(item.status)).length,
    completed: workOrders.filter((item) => item.status === "COMPLETED").length
  }), [workOrders]);

  function replaceWorkOrder(workOrder: WorkOrder) {
    setSelectedWorkOrder(workOrder);
    setProviderId(workOrder.providerId ?? "");
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
      if (editor.mode === "edit") replaceWorkOrder(response.workOrder);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save work order");
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to ${label.toLowerCase()}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCancel(workOrder: WorkOrder) {
    if (!window.confirm(`Cancel work order ${workOrder.title}?`)) return;
    await runAction("Cancel", () => cancelWorkOrder(workOrder.id));
  }

  async function saveEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkOrder) return;
    setSaving(true);
    setError("");
    try {
      await addWorkOrderEvidence(selectedWorkOrder.id, evidencePayload(evidenceDraft));
      await refreshDetail(selectedWorkOrder.id);
      setEvidenceDraft(emptyEvidenceDraft());
      setShowEvidenceForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add evidence");
    } finally {
      setSaving(false);
    }
  }

  async function saveServiceDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkOrder || !serviceDetailsEditor) return;
    setSaving(true);
    setError("");
    try {
      const response = await updateWorkOrderServiceDetails(selectedWorkOrder.id, serviceDetailsPayload(serviceDetailsEditor));
      replaceWorkOrder(response.workOrder);
      setServiceDetailsEditor(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save service details");
    } finally {
      setSaving(false);
    }
  }

  const isAssignedProvider = selectedWorkOrder?.providerId === user.id;
  const canAddEvidence = Boolean(selectedWorkOrder
    && user.role === "SERVICE_PROVIDER"
    && isAssignedProvider
    && ["SENT_TO_PROVIDER", "IN_PROGRESS", "COMPLETED"].includes(selectedWorkOrder.status));
  const canEditServiceDetails = Boolean(selectedWorkOrder
    && user.role === "SERVICE_PROVIDER"
    && isAssignedProvider
    && ["SENT_TO_PROVIDER", "IN_PROGRESS"].includes(selectedWorkOrder.status));
  const isTerminal = selectedWorkOrder ? ["COMPLETED", "CANCELLED"].includes(selectedWorkOrder.status) : false;

  return (
    <section className="work-order-workspace" aria-labelledby="work-orders-heading">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Service workflow</p>
          <h1 id="work-orders-heading">Work orders</h1>
          <p className="muted">Manage service approval, provider progress, cost, parts, and evidence.</p>
        </div>
        <div className="workspace-heading-actions">
          <button className="secondary-button button-with-icon" type="button" onClick={() => void loadRegister()} disabled={loadingList}>
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
          {canManage && (
            <button className="primary-button button-with-icon" type="button" onClick={() => setEditor({ mode: "create", draft: emptyWorkOrderDraft() })}>
              <Plus aria-hidden="true" /> New work order
            </button>
          )}
        </div>
      </div>

      {error && <p className="form-error workspace-error" role="alert">{error}</p>}

      <div className="work-order-summary" aria-label="Work order summary">
        <article><ClipboardList aria-hidden="true" /><div><strong>{loadingList ? "-" : summary.total}</strong><span>Total</span></div></article>
        <article><UserRound aria-hidden="true" /><div><strong>{loadingList ? "-" : summary.pending}</strong><span>Awaiting approval</span></div></article>
        <article><Play aria-hidden="true" /><div><strong>{loadingList ? "-" : summary.active}</strong><span>Active</span></div></article>
        <article><CheckCircle2 aria-hidden="true" /><div><strong>{loadingList ? "-" : summary.completed}</strong><span>Completed</span></div></article>
      </div>

      <div className="work-order-layout">
        <aside className="work-order-index" aria-label="Work order register">
          <div className="work-order-filters">
            <label className="search-field">
              <span className="sr-only">Search work orders</span>
              <Search aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search orders, assets..." />
            </label>
            <label>
              <span className="sr-only">Filter work orders by status</span>
              <select aria-label="Filter work orders by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as WorkOrderStatus | "ALL")}>
                <option value="ALL">All statuses</option>
                {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
          </div>
          <div className="index-summary"><strong>{visibleWorkOrders.length}</strong> of {workOrders.length} work orders</div>

          {loadingList ? (
            <div className="workspace-state work-order-state" role="status"><span className="loading-mark small" aria-hidden="true" /><strong>Loading work orders</strong></div>
          ) : error && workOrders.length === 0 ? (
            <div className="workspace-state work-order-state"><AlertCircle aria-hidden="true" /><strong>Work orders unavailable</strong><span>Check the connection and try again.</span><button className="secondary-button" type="button" onClick={() => void loadRegister()}>Try again</button></div>
          ) : workOrders.length === 0 ? (
            <div className="workspace-state work-order-state"><ClipboardCheck aria-hidden="true" /><strong>No work orders</strong><span>{canManage ? "Create the first service record." : "No work orders are assigned to you."}</span></div>
          ) : visibleWorkOrders.length === 0 ? (
            <div className="workspace-state work-order-state"><Search aria-hidden="true" /><strong>No matching work orders</strong><span>Adjust the search or status filter.</span></div>
          ) : (
            <div className="work-order-list">
              {visibleWorkOrders.map((workOrder) => (
                <button
                  className={`work-order-list-item${selectedId === workOrder.id ? " selected" : ""}`}
                  key={workOrder.id}
                  type="button"
                  onClick={() => setSelectedId(workOrder.id)}
                  aria-pressed={selectedId === workOrder.id}
                >
                  <span className="work-order-list-top"><strong>{workOrder.machine.assetCode}</strong><span className={`work-order-status status-${workOrder.status.toLowerCase()}`}>{statusLabels[workOrder.status]}</span></span>
                  <span className="work-order-title">{workOrder.title}</span>
                  <span className="work-order-meta"><CalendarDays aria-hidden="true" />{displayDate(workOrder.scheduledDate)}</span>
                  <span className="work-order-meta"><MapPin aria-hidden="true" />{workOrder.machine.location}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <article className="work-order-detail" aria-label="Work order detail" aria-live="polite">
          {loadingDetail ? (
            <div className="workspace-state detail-state"><span className="loading-mark" aria-hidden="true" /><strong>Loading work order</strong></div>
          ) : !selectedWorkOrder ? (
            <div className="workspace-state detail-state"><ClipboardList aria-hidden="true" /><strong>Select a work order</strong><span>Workflow details and evidence will appear here.</span></div>
          ) : (
            <>
              <header className="work-order-header">
                <div>
                  <div className="work-order-title-line"><span className="asset-code">{selectedWorkOrder.machine.assetCode}</span><span className={`work-order-status status-${selectedWorkOrder.status.toLowerCase()}`}>{statusLabels[selectedWorkOrder.status]}</span></div>
                  <h2>{selectedWorkOrder.title}</h2>
                  <p>{selectedWorkOrder.machine.name} · {selectedWorkOrder.machine.location}</p>
                </div>
                <div className="work-order-actions">
                  {canManage && selectedWorkOrder.status === "DRAFT" && (
                    <>
                      <button className="secondary-button button-with-icon" type="button" onClick={() => setEditor({ mode: "edit", workOrderId: selectedWorkOrder.id, draft: workOrderDraft(selectedWorkOrder) })}><Pencil aria-hidden="true" /> Edit</button>
                      <button className="primary-button button-with-icon" type="button" disabled={busyAction !== null} onClick={() => void runAction("Submit", () => submitWorkOrder(selectedWorkOrder.id))}><Send aria-hidden="true" /> {busyAction === "Submit" ? "Submitting..." : "Submit"}</button>
                    </>
                  )}
                  {user.role === "MACHINE_OPERATOR" && selectedWorkOrder.status === "PENDING_OPERATOR_APPROVAL" && (
                    <button className="primary-button button-with-icon" type="button" disabled={busyAction !== null} onClick={() => void runAction("Approve", () => approveWorkOrder(selectedWorkOrder.id))}><Check aria-hidden="true" /> {busyAction === "Approve" ? "Approving..." : "Approve"}</button>
                  )}
                  {user.role === "SERVICE_PROVIDER" && isAssignedProvider && selectedWorkOrder.status === "SENT_TO_PROVIDER" && (
                    <button className="primary-button button-with-icon" type="button" disabled={busyAction !== null} onClick={() => void runAction("Start work", () => startWorkOrder(selectedWorkOrder.id))}><Play aria-hidden="true" /> {busyAction === "Start work" ? "Starting..." : "Start work"}</button>
                  )}
                  {user.role === "SERVICE_PROVIDER" && isAssignedProvider && selectedWorkOrder.status === "IN_PROGRESS" && (
                    <button className="primary-button button-with-icon" type="button" disabled={busyAction !== null} onClick={() => void runAction("Complete", () => completeWorkOrder(selectedWorkOrder.id))}><CheckCircle2 aria-hidden="true" /> {busyAction === "Complete" ? "Completing..." : "Complete work"}</button>
                  )}
                  {canEditServiceDetails && (
                    <button className="secondary-button button-with-icon" type="button" onClick={() => setServiceDetailsEditor(serviceDetailsDraft(selectedWorkOrder))}><Pencil aria-hidden="true" /> Service details</button>
                  )}
                  {canManage && !isTerminal && (
                    <button className="secondary-button button-with-icon danger-button" type="button" disabled={busyAction !== null} onClick={() => void handleCancel(selectedWorkOrder)}><XCircle aria-hidden="true" /> Cancel</button>
                  )}
                </div>
              </header>

              {canManage && selectedWorkOrder.status === "APPROVED" && (
                <div className="provider-dispatch">
                  <label>Active service provider
                    <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                      <option value="">Select a provider</option>
                      {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.email})</option>)}
                    </select>
                  </label>
                  <button className="primary-button button-with-icon" type="button" disabled={!providerId || busyAction !== null} onClick={() => void runAction("Send to provider", () => sendWorkOrderToProvider(selectedWorkOrder.id, providerId))}><Send aria-hidden="true" /> {busyAction === "Send to provider" ? "Sending..." : "Send to provider"}</button>
                </div>
              )}

              <dl className="work-order-facts">
                <div><dt>Planned service date</dt><dd>{displayDate(selectedWorkOrder.scheduledDate)}</dd></div>
                <div><dt>Actual completion date</dt><dd>{displayDate(selectedWorkOrder.completedDate)}</dd></div>
                <div><dt>Service provider</dt><dd>{selectedWorkOrder.provider?.name ?? "Unassigned"}</dd></div>
                <div><dt>Approved by operator</dt><dd>{selectedWorkOrder.approvedByOperator?.name ?? "Not approved"}</dd></div>
                <div><dt>Cost</dt><dd>{displayCost(selectedWorkOrder.cost)}</dd></div>
                <div><dt>Created</dt><dd>{displayDate(selectedWorkOrder.createdAt)}</dd></div>
              </dl>

              <div className="work-order-copy-grid">
                <section><h3>Description</h3><p>{selectedWorkOrder.description ?? "No description recorded."}</p></section>
                <section><h3>Replaced parts</h3><p>{selectedWorkOrder.replacedParts ?? "No replaced parts recorded."}</p></section>
                <section className="full-width"><h3>Notes</h3><p>{selectedWorkOrder.notes ?? "No notes recorded."}</p></section>
              </div>

              <section className="record-section" aria-labelledby="evidence-heading">
                <div className="section-heading compact">
                  <div><p className="eyebrow">Documentation</p><h3 id="evidence-heading">Evidence register</h3></div>
                  {canAddEvidence && <button className="secondary-button button-with-icon" type="button" onClick={() => setShowEvidenceForm((current) => !current)}><FilePlus2 aria-hidden="true" /> {showEvidenceForm ? "Close form" : "Add evidence"}</button>}
                </div>

                {showEvidenceForm && canAddEvidence && (
                  <form className="evidence-form" onSubmit={saveEvidence}>
                    <label>Evidence type<select value={evidenceDraft.type} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, type: event.target.value as EvidenceType })}>{evidenceTypes.map((type) => <option key={type} value={type}>{evidenceLabels[type]}</option>)}</select></label>
                    <label>File name<input value={evidenceDraft.fileName} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, fileName: event.target.value })} required maxLength={255} /></label>
                    <label>File URL<input type="url" value={evidenceDraft.fileUrl} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, fileUrl: event.target.value })} placeholder="https://..." /></label>
                    <label className="form-span">Notes<textarea value={evidenceDraft.notes} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, notes: event.target.value })} rows={2} maxLength={1000} /></label>
                    <div className="evidence-form-actions"><button className="primary-button button-with-icon" type="submit" disabled={saving}><Save aria-hidden="true" />{saving ? "Saving..." : "Save evidence"}</button></div>
                  </form>
                )}

                {selectedWorkOrder.evidence.length === 0 ? (
                  <div className="empty-row"><FileText aria-hidden="true" /><span>No service evidence recorded.</span></div>
                ) : (
                  <div className="evidence-list">
                    {selectedWorkOrder.evidence.map((evidence) => (
                      <article key={evidence.id}>
                        <span className="evidence-icon"><FileText aria-hidden="true" /></span>
                        <div><strong>{evidence.fileName}</strong><span>{evidenceLabels[evidence.type]} · {displayDate(evidence.createdAt)}</span>{evidence.notes && <p>{evidence.notes}</p>}</div>
                        {evidence.fileUrl && <a href={evidence.fileUrl} target="_blank" rel="noreferrer">Open file</a>}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </article>
      </div>

      {editor && (
        <section className="editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="work-order-editor-heading">
          <form className="record-editor" onSubmit={saveWorkOrder}>
            <div className="editor-heading"><div><p className="eyebrow">Service record</p><h2 id="work-order-editor-heading">{editor.mode === "create" ? "New work order" : "Edit work order"}</h2></div><button className="close-button" type="button" onClick={() => setEditor(null)} aria-label="Close editor"><X aria-hidden="true" /></button></div>
            <div className="form-grid">
              <label className="form-span">Machine<select value={editor.draft.machineId} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, machineId: event.target.value } })} required><option value="">Select a machine</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.assetCode} · {machine.name}</option>)}</select></label>
              <label className="form-span">Title<input value={editor.draft.title} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, title: event.target.value } })} required maxLength={160} /></label>
              <label>Planned service date<input type="date" value={editor.draft.scheduledDate} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, scheduledDate: event.target.value } })} /></label>
              <label>Cost (LKR)<input type="number" min="0" step="0.01" value={editor.draft.cost} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, cost: event.target.value } })} /></label>
              <label className="form-span">Description<textarea value={editor.draft.description ?? ""} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, description: event.target.value } })} rows={3} maxLength={2000} /></label>
              <label className="form-span">Replaced parts<textarea value={editor.draft.replacedParts ?? ""} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, replacedParts: event.target.value } })} rows={2} maxLength={2000} /></label>
              <label className="form-span">Notes<textarea value={editor.draft.notes ?? ""} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, notes: event.target.value } })} rows={3} maxLength={2000} /></label>
            </div>
            <div className="editor-actions"><button className="secondary-button" type="button" onClick={() => setEditor(null)}>Cancel</button><button className="primary-button button-with-icon" disabled={saving} type="submit"><Save aria-hidden="true" />{saving ? "Saving..." : "Save work order"}</button></div>
          </form>
        </section>
      )}

      {serviceDetailsEditor && selectedWorkOrder && (
        <section className="editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="service-details-editor-heading">
          <form className="record-editor compact-editor" onSubmit={saveServiceDetails}>
            <div className="editor-heading"><div><p className="eyebrow">Provider service record</p><h2 id="service-details-editor-heading">Service details</h2></div><button className="close-button" type="button" onClick={() => setServiceDetailsEditor(null)} aria-label="Close service details editor"><X aria-hidden="true" /></button></div>
            <div className="form-grid">
              <label>Actual service date<input type="date" value={serviceDetailsEditor.completedDate} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, completedDate: event.target.value })} /></label>
              <label>Final cost (LKR)<input type="number" min="0" step="0.01" value={serviceDetailsEditor.cost} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, cost: event.target.value })} /></label>
              <label className="form-span">Replaced parts<textarea value={serviceDetailsEditor.replacedParts} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, replacedParts: event.target.value })} rows={3} maxLength={2000} /></label>
              <label className="form-span">Service notes<textarea value={serviceDetailsEditor.notes} onChange={(event) => setServiceDetailsEditor({ ...serviceDetailsEditor, notes: event.target.value })} rows={3} maxLength={2000} /></label>
            </div>
            <div className="editor-actions"><button className="secondary-button" type="button" onClick={() => setServiceDetailsEditor(null)}>Cancel</button><button className="primary-button button-with-icon" disabled={saving} type="submit"><Save aria-hidden="true" />{saving ? "Saving..." : "Save service details"}</button></div>
          </form>
        </section>
      )}
    </section>
  );
}
