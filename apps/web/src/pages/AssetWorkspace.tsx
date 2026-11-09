import {
  CalendarClock,
  Database,
  MapPin,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createMachine,
  createMachinePart,
  createMaintenancePlan,
  deleteMachine,
  deleteMachinePart,
  deleteMaintenancePlan,
  getMachine,
  getMachineParts,
  getMachines,
  getMaintenancePlans,
  getOperators,
  updateMachine,
  updateMachinePart,
  updateMaintenancePlan,
  type Machine,
  type MachineInput,
  type MachinePart,
  type MachinePartInput,
  type MachineStatus,
  type MaintenanceFrequency,
  type MaintenancePlan,
  type MaintenancePlanInput,
  type Operator,
  type User
} from "../services/api";

type AssetWorkspaceProps = {
  user: User;
};

type MachineDraft = Omit<MachineInput, "warrantyStart" | "warrantyEnd"> & {
  warrantyStart: string;
  warrantyEnd: string;
};

type PartDraft = Omit<MachinePartInput, "warrantyStart" | "warrantyEnd" | "replacementDue"> & {
  warrantyStart: string;
  warrantyEnd: string;
  replacementDue: string;
};

type PlanDraft = Omit<MaintenancePlanInput, "nextDueDate"> & {
  nextDueDate: string;
};

type MachineEditor = { mode: "create" | "edit"; machineId?: string; draft: MachineDraft };
type PartEditor = { mode: "create" | "edit"; partId?: string; draft: PartDraft };
type PlanEditor = { mode: "create" | "edit"; planId?: string; draft: PlanDraft };

const statusLabels: Record<MachineStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNDER_MAINTENANCE: "Under maintenance",
  RETIRED: "Retired"
};

const frequencyLabels: Record<MaintenanceFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  CUSTOM: "Custom"
};

const machineStatuses = Object.keys(statusLabels) as MachineStatus[];
const maintenanceFrequencies = Object.keys(frequencyLabels) as MaintenanceFrequency[];

function emptyMachineDraft(): MachineDraft {
  return {
    assetCode: "",
    name: "",
    category: "",
    location: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    warrantyStart: "",
    warrantyEnd: "",
    status: "ACTIVE",
    operatorId: ""
  };
}

function emptyPartDraft(): PartDraft {
  return {
    name: "",
    partNumber: "",
    warrantyStart: "",
    warrantyEnd: "",
    replacementDue: "",
    quantity: 1
  };
}

function emptyPlanDraft(): PlanDraft {
  return {
    title: "",
    description: "",
    frequency: "MONTHLY",
    intervalDays: null,
    nextDueDate: "",
    thresholdDays: 7,
    isActive: true
  };
}

function dateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function apiDate(value: string) {
  return value || null;
}

function displayDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function machineDraft(machine: Machine): MachineDraft {
  return {
    assetCode: machine.assetCode,
    name: machine.name,
    category: machine.category,
    location: machine.location,
    manufacturer: machine.manufacturer ?? "",
    model: machine.model ?? "",
    serialNumber: machine.serialNumber ?? "",
    warrantyStart: dateInputValue(machine.warrantyStart),
    warrantyEnd: dateInputValue(machine.warrantyEnd),
    status: machine.status,
    operatorId: machine.operatorId ?? ""
  };
}

function partDraft(part: MachinePart): PartDraft {
  return {
    name: part.name,
    partNumber: part.partNumber ?? "",
    warrantyStart: dateInputValue(part.warrantyStart),
    warrantyEnd: dateInputValue(part.warrantyEnd),
    replacementDue: dateInputValue(part.replacementDue),
    quantity: part.quantity
  };
}

function planDraft(plan: MaintenancePlan): PlanDraft {
  return {
    title: plan.title,
    description: plan.description ?? "",
    frequency: plan.frequency,
    intervalDays: plan.intervalDays,
    nextDueDate: dateInputValue(plan.nextDueDate),
    thresholdDays: plan.thresholdDays,
    isActive: plan.isActive
  };
}

function machinePayload(draft: MachineDraft): MachineInput {
  return {
    ...draft,
    assetCode: draft.assetCode.trim().toUpperCase(),
    name: draft.name.trim(),
    category: draft.category.trim(),
    location: draft.location.trim(),
    manufacturer: draft.manufacturer?.trim() || null,
    model: draft.model?.trim() || null,
    serialNumber: draft.serialNumber?.trim() || null,
    warrantyStart: apiDate(draft.warrantyStart),
    warrantyEnd: apiDate(draft.warrantyEnd),
    operatorId: draft.operatorId || null
  };
}

function partPayload(draft: PartDraft): MachinePartInput {
  return {
    name: draft.name.trim(),
    partNumber: draft.partNumber?.trim() || null,
    warrantyStart: apiDate(draft.warrantyStart),
    warrantyEnd: apiDate(draft.warrantyEnd),
    replacementDue: apiDate(draft.replacementDue),
    quantity: draft.quantity
  };
}

function planPayload(draft: PlanDraft): MaintenancePlanInput {
  return {
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    frequency: draft.frequency,
    intervalDays: draft.frequency === "CUSTOM" ? draft.intervalDays : null,
    nextDueDate: apiDate(draft.nextDueDate) ?? "",
    thresholdDays: draft.thresholdDays,
    isActive: draft.isActive
  };
}

export function AssetWorkspace(props: AssetWorkspaceProps) {
  if (props.user.role === "SERVICE_PROVIDER") return null;
  return <AssetWorkspaceContent {...props} />;
}

function AssetWorkspaceContent({ user }: AssetWorkspaceProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [parts, setParts] = useState<MachinePart[]>([]);
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [query, setQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [machineEditor, setMachineEditor] = useState<MachineEditor | null>(null);
  const [partEditor, setPartEditor] = useState<PartEditor | null>(null);
  const [planEditor, setPlanEditor] = useState<PlanEditor | null>(null);

  const canManageAssets = user.role === "ADMIN" || user.role === "OWNER" || user.role === "MANAGER";
  const canManagePlans = canManageAssets || user.role === "MACHINE_OPERATOR";
  const canDeleteMachine = user.role === "ADMIN";
  const canDeleteNested = user.role === "ADMIN" || user.role === "MANAGER";

  async function loadMachines(preferredId?: string) {
    setLoadingList(true);
    setError("");
    try {
      const requests: [ReturnType<typeof getMachines>, Promise<{ operators: Operator[] }> | null] = [
        getMachines(),
        canManageAssets ? getOperators() : null
      ];
      const [machineResponse, operatorResponse] = await Promise.all([
        requests[0],
        requests[1] ?? Promise.resolve({ operators: [] })
      ]);
      setMachines(machineResponse.machines);
      setOperators(operatorResponse.operators);
      setSelectedId((current) => {
        const requested = preferredId ?? current;
        return requested && machineResponse.machines.some((machine) => machine.id === requested)
          ? requested
          : machineResponse.machines[0]?.id ?? null;
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load assets");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void loadMachines();
  }, [user.role]);

  useEffect(() => {
    setMachineEditor(null);
    setPartEditor(null);
    setPlanEditor(null);

    if (!selectedId) {
      setSelectedMachine(null);
      setParts([]);
      setPlans([]);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setError("");
    Promise.all([getMachine(selectedId), getMachineParts(selectedId), getMaintenancePlans(selectedId)])
      .then(([machineResponse, partResponse, planResponse]) => {
        if (cancelled) return;
        setSelectedMachine(machineResponse.machine);
        setParts(partResponse.parts);
        setPlans(planResponse.plans);
      })
      .catch((requestError: Error) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const visibleMachines = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return machines;
    return machines.filter((machine) =>
      [machine.assetCode, machine.name, machine.category, machine.location, machine.operator?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized))
    );
  }, [machines, query]);

  function selectMachine(id: string) {
    if (id === selectedId) return;
    setMachineEditor(null);
    setPartEditor(null);
    setPlanEditor(null);
    setSelectedId(id);
  }

  async function saveMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!machineEditor) return;
    setSaving(true);
    setError("");
    try {
      if (machineEditor.mode === "create") {
        const response = await createMachine(machinePayload(machineEditor.draft));
        setMachineEditor(null);
        await loadMachines(response.machine.id);
      } else if (machineEditor.machineId && machineEditor.machineId === selectedId) {
        const response = await updateMachine(machineEditor.machineId, machinePayload(machineEditor.draft));
        setMachines((current) => current.map((machine) => machine.id === response.machine.id ? response.machine : machine));
        setSelectedMachine(response.machine);
        setMachineEditor(null);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save machine");
    } finally {
      setSaving(false);
    }
  }

  async function removeMachine() {
    if (!selectedMachine || !window.confirm(`Delete ${selectedMachine.assetCode}? This also removes its parts and plans.`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteMachine(selectedMachine.id);
      setMachineEditor(null);
      setSelectedMachine(null);
      await loadMachines();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete machine");
    } finally {
      setSaving(false);
    }
  }

  async function savePart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partEditor || !selectedId) return;
    setSaving(true);
    setError("");
    try {
      const response = partEditor.mode === "create"
        ? await createMachinePart(selectedId, partPayload(partEditor.draft))
        : await updateMachinePart(selectedId, partEditor.partId!, partPayload(partEditor.draft));
      setParts((current) => partEditor.mode === "create"
        ? [...current, response.part]
        : current.map((part) => part.id === response.part.id ? response.part : part));
      setPartEditor(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save part");
    } finally {
      setSaving(false);
    }
  }

  async function removePart(part: MachinePart) {
    if (!selectedId || !window.confirm(`Delete part ${part.name}?`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteMachinePart(selectedId, part.id);
      setParts((current) => current.filter((item) => item.id !== part.id));
      if (partEditor?.partId === part.id) setPartEditor(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete part");
    } finally {
      setSaving(false);
    }
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planEditor || !selectedId) return;
    setSaving(true);
    setError("");
    try {
      const response = planEditor.mode === "create"
        ? await createMaintenancePlan(selectedId, planPayload(planEditor.draft))
        : await updateMaintenancePlan(selectedId, planEditor.planId!, planPayload(planEditor.draft));
      setPlans((current) => planEditor.mode === "create"
        ? [...current, response.plan]
        : current.map((plan) => plan.id === response.plan.id ? response.plan : plan));
      setPlanEditor(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save maintenance plan");
    } finally {
      setSaving(false);
    }
  }

  async function removePlan(plan: MaintenancePlan) {
    if (!selectedId || !window.confirm(`Delete maintenance plan ${plan.title}?`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteMaintenancePlan(selectedId, plan.id);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      if (planEditor?.planId === plan.id) setPlanEditor(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete maintenance plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="asset-workspace" aria-labelledby="assets-heading">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Asset registry</p>
          <h1 id="assets-heading">Machines and maintenance</h1>
          <p className="muted">Track assigned machines, installed parts, warranties, and recurring maintenance.</p>
        </div>
        <div className="workspace-heading-actions">
          <button className="secondary-button button-with-icon" type="button" onClick={() => void loadMachines()} disabled={loadingList}>
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
          {canManageAssets && (
            <button className="primary-button button-with-icon" type="button" onClick={() => setMachineEditor({ mode: "create", draft: emptyMachineDraft() })}>
              <Plus aria-hidden="true" /> Add machine
            </button>
          )}
        </div>
      </div>

      {user.role === "MACHINE_OPERATOR" && (
        <p className="permission-note"><ShieldCheck aria-hidden="true" /> Manage maintenance plans for assigned machines; asset and part records are read-only.</p>
      )}
      {error && <p className="form-error workspace-error" role="alert">{error}</p>}

      <div className="asset-layout">
        <aside className="asset-index" aria-label="Machine list">
          <label className="search-field">
            <span className="sr-only">Search machines</span>
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, name, location..." />
          </label>
          <div className="index-summary"><strong>{visibleMachines.length}</strong> of {machines.length} machines</div>

          {loadingList ? (
            <div className="workspace-state"><span className="loading-mark small" />Loading machines...</div>
          ) : visibleMachines.length === 0 ? (
            <div className="workspace-state"><Database aria-hidden="true" /><strong>{machines.length ? "No matching machines" : "No machines yet"}</strong><span>{machines.length ? "Try a different search." : canManageAssets ? "Add the first machine to begin." : "No assigned records are available."}</span></div>
          ) : (
            <div className="machine-list">
              {visibleMachines.map((machine) => (
                <button
                  className={`machine-list-item${machine.id === selectedId ? " selected" : ""}`}
                  key={machine.id}
                  type="button"
                  onClick={() => selectMachine(machine.id)}
                  aria-pressed={machine.id === selectedId}
                >
                  <span className="machine-list-top"><strong>{machine.assetCode}</strong><span className={`machine-status status-${machine.status.toLowerCase()}`}>{statusLabels[machine.status]}</span></span>
                  <span className="machine-name">{machine.name}</span>
                  <span className="machine-location"><MapPin aria-hidden="true" />{machine.location}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="asset-detail">
          {loadingDetail ? (
            <div className="workspace-state detail-state"><span className="loading-mark" />Loading machine record...</div>
          ) : !selectedMachine ? (
            <div className="workspace-state detail-state"><Database aria-hidden="true" /><strong>Select a machine</strong><span>Machine details, parts, and plans will appear here.</span></div>
          ) : (
            <>
              <header className="machine-header">
                <div>
                  <div className="machine-title-line"><span className="asset-code">{selectedMachine.assetCode}</span><span className={`machine-status status-${selectedMachine.status.toLowerCase()}`}>{statusLabels[selectedMachine.status]}</span></div>
                  <h2>{selectedMachine.name}</h2>
                  <p>{selectedMachine.category}</p>
                </div>
                {canManageAssets && (
                  <div className="row-actions">
                    <button className="secondary-button button-with-icon" type="button" onClick={() => setMachineEditor({ mode: "edit", machineId: selectedMachine.id, draft: machineDraft(selectedMachine) })}>
                      <Pencil aria-hidden="true" /> Edit machine
                    </button>
                    {canDeleteMachine && (
                      <button className="danger-icon-button" type="button" onClick={() => void removeMachine()} disabled={saving} aria-label={`Delete machine ${selectedMachine.assetCode}`} title="Delete machine">
                        <Trash2 aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </header>

              <dl className="machine-facts">
                <div><dt><MapPin aria-hidden="true" />Location</dt><dd>{selectedMachine.location}</dd></div>
                <div><dt><UserRound aria-hidden="true" />Operator</dt><dd>{selectedMachine.operator?.name ?? "Unassigned"}</dd></div>
                <div><dt>Manufacturer</dt><dd>{selectedMachine.manufacturer ?? "Not set"}</dd></div>
                <div><dt>Model / serial</dt><dd>{[selectedMachine.model, selectedMachine.serialNumber].filter(Boolean).join(" / ") || "Not set"}</dd></div>
                <div><dt>Warranty start</dt><dd>{displayDate(selectedMachine.warrantyStart)}</dd></div>
                <div><dt>Warranty end</dt><dd>{displayDate(selectedMachine.warrantyEnd)}</dd></div>
              </dl>

              <section className="record-section" aria-labelledby="parts-heading">
                <div className="section-heading compact">
                  <div><p className="eyebrow">Inventory</p><h3 id="parts-heading">Machine parts</h3></div>
                  {canManageAssets && <button className="secondary-button button-with-icon" type="button" onClick={() => setPartEditor({ mode: "create", draft: emptyPartDraft() })}><Plus aria-hidden="true" /> Add part</button>}
                </div>
                {parts.length === 0 ? (
                  <div className="empty-row"><Package aria-hidden="true" /><span>No parts recorded for this machine.</span></div>
                ) : (
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Part</th><th>Quantity</th><th>Warranty end</th><th>Replacement due</th>{canManageAssets && <th><span className="sr-only">Actions</span></th>}</tr></thead>
                      <tbody>{parts.map((part) => (
                        <tr key={part.id}>
                          <td><strong>{part.name}</strong><span>{part.partNumber ?? "No part number"}</span></td>
                          <td>{part.quantity}</td><td>{displayDate(part.warrantyEnd)}</td><td>{displayDate(part.replacementDue)}</td>
                          {canManageAssets && <td><div className="table-actions"><button className="table-icon-button" type="button" onClick={() => setPartEditor({ mode: "edit", partId: part.id, draft: partDraft(part) })} aria-label={`Edit part ${part.name}`} title="Edit part"><Pencil aria-hidden="true" /></button>{canDeleteNested && <button className="table-icon-button danger" type="button" onClick={() => void removePart(part)} aria-label={`Delete part ${part.name}`} title="Delete part"><Trash2 aria-hidden="true" /></button>}</div></td>}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="record-section" aria-labelledby="plans-heading">
                <div className="section-heading compact">
                  <div><p className="eyebrow">Schedule</p><h3 id="plans-heading">Maintenance plans</h3></div>
                  {canManagePlans && <button className="secondary-button button-with-icon" type="button" onClick={() => setPlanEditor({ mode: "create", draft: emptyPlanDraft() })}><Plus aria-hidden="true" /> Add plan</button>}
                </div>
                {plans.length === 0 ? (
                  <div className="empty-row"><CalendarClock aria-hidden="true" /><span>No maintenance plans recorded.</span></div>
                ) : (
                  <div className="plan-list">{plans.map((plan) => (
                    <article className="plan-row" key={plan.id}>
                      <div className="plan-date"><span>Next due</span><strong>{displayDate(plan.nextDueDate)}</strong></div>
                      <div className="plan-main"><div><strong>{plan.title}</strong><span className={plan.isActive ? "status-active" : "status-inactive"}>{plan.isActive ? "Active" : "Paused"}</span></div><p>{frequencyLabels[plan.frequency]}{plan.frequency === "CUSTOM" && plan.intervalDays ? `, every ${plan.intervalDays} days` : ""} · Alert {plan.thresholdDays} days before</p>{plan.description && <span>{plan.description}</span>}</div>
                      {canManagePlans && <div className="table-actions"><button className="table-icon-button" type="button" onClick={() => setPlanEditor({ mode: "edit", planId: plan.id, draft: planDraft(plan) })} aria-label={`Edit plan ${plan.title}`} title="Edit plan"><Pencil aria-hidden="true" /></button>{canDeleteNested && <button className="table-icon-button danger" type="button" onClick={() => void removePlan(plan)} aria-label={`Delete plan ${plan.title}`} title="Delete plan"><Trash2 aria-hidden="true" /></button>}</div>}
                    </article>
                  ))}</div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {machineEditor && (
        <section className="editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="machine-editor-heading">
          <form className="record-editor" onSubmit={saveMachine}>
            <EditorHeading title={machineEditor.mode === "create" ? "Add machine" : "Edit machine"} id="machine-editor-heading" onClose={() => setMachineEditor(null)} />
            <div className="form-grid">
              <label>Asset code<input value={machineEditor.draft.assetCode} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, assetCode: event.target.value } })} required maxLength={40} /></label>
              <label>Machine name<input value={machineEditor.draft.name} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, name: event.target.value } })} required maxLength={120} /></label>
              <label>Category<input value={machineEditor.draft.category} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, category: event.target.value } })} required maxLength={80} /></label>
              <label>Location<input value={machineEditor.draft.location} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, location: event.target.value } })} required maxLength={120} /></label>
              <label>Manufacturer<input value={machineEditor.draft.manufacturer ?? ""} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, manufacturer: event.target.value } })} maxLength={100} /></label>
              <label>Model<input value={machineEditor.draft.model ?? ""} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, model: event.target.value } })} maxLength={100} /></label>
              <label>Serial number<input value={machineEditor.draft.serialNumber ?? ""} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, serialNumber: event.target.value } })} maxLength={100} /></label>
              <label>Status<select value={machineEditor.draft.status} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, status: event.target.value as MachineStatus } })}>{machineStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
              <label>Warranty start<input type="date" value={machineEditor.draft.warrantyStart} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, warrantyStart: event.target.value } })} /></label>
              <label>Warranty end<input type="date" min={machineEditor.draft.warrantyStart || undefined} value={machineEditor.draft.warrantyEnd} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, warrantyEnd: event.target.value } })} /></label>
              <label className="form-span">Assigned operator<select value={machineEditor.draft.operatorId ?? ""} onChange={(event) => setMachineEditor({ ...machineEditor, draft: { ...machineEditor.draft, operatorId: event.target.value } })}><option value="">Unassigned</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name} ({operator.email})</option>)}</select></label>
            </div>
            <EditorActions saving={saving} onCancel={() => setMachineEditor(null)} />
          </form>
        </section>
      )}

      {partEditor && (
        <section className="editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="part-editor-heading">
          <form className="record-editor compact-editor" onSubmit={savePart}>
            <EditorHeading title={partEditor.mode === "create" ? "Add machine part" : "Edit machine part"} id="part-editor-heading" onClose={() => setPartEditor(null)} />
            <div className="form-grid">
              <label>Part name<input value={partEditor.draft.name} onChange={(event) => setPartEditor({ ...partEditor, draft: { ...partEditor.draft, name: event.target.value } })} required maxLength={120} /></label>
              <label>Part number<input value={partEditor.draft.partNumber ?? ""} onChange={(event) => setPartEditor({ ...partEditor, draft: { ...partEditor.draft, partNumber: event.target.value } })} maxLength={100} /></label>
              <label>Quantity<input type="number" min={1} max={100000} value={partEditor.draft.quantity} onChange={(event) => setPartEditor({ ...partEditor, draft: { ...partEditor.draft, quantity: Number(event.target.value) } })} required /></label>
              <label>Replacement due<input type="date" value={partEditor.draft.replacementDue} onChange={(event) => setPartEditor({ ...partEditor, draft: { ...partEditor.draft, replacementDue: event.target.value } })} /></label>
              <label>Warranty start<input type="date" value={partEditor.draft.warrantyStart} onChange={(event) => setPartEditor({ ...partEditor, draft: { ...partEditor.draft, warrantyStart: event.target.value } })} /></label>
              <label>Warranty end<input type="date" min={partEditor.draft.warrantyStart || undefined} value={partEditor.draft.warrantyEnd} onChange={(event) => setPartEditor({ ...partEditor, draft: { ...partEditor.draft, warrantyEnd: event.target.value } })} /></label>
            </div>
            <EditorActions saving={saving} onCancel={() => setPartEditor(null)} />
          </form>
        </section>
      )}

      {planEditor && (
        <section className="editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="plan-editor-heading">
          <form className="record-editor compact-editor" onSubmit={savePlan}>
            <EditorHeading title={planEditor.mode === "create" ? "Add maintenance plan" : "Edit maintenance plan"} id="plan-editor-heading" onClose={() => setPlanEditor(null)} />
            <div className="form-grid">
              <label className="form-span">Plan title<input value={planEditor.draft.title} onChange={(event) => setPlanEditor({ ...planEditor, draft: { ...planEditor.draft, title: event.target.value } })} required maxLength={140} /></label>
              <label>Frequency<select value={planEditor.draft.frequency} onChange={(event) => setPlanEditor({ ...planEditor, draft: { ...planEditor.draft, frequency: event.target.value as MaintenanceFrequency, intervalDays: event.target.value === "CUSTOM" ? planEditor.draft.intervalDays ?? 30 : null } })}>{maintenanceFrequencies.map((frequency) => <option key={frequency} value={frequency}>{frequencyLabels[frequency]}</option>)}</select></label>
              {planEditor.draft.frequency === "CUSTOM" && <label>Interval days<input type="number" min={1} max={3650} value={planEditor.draft.intervalDays ?? ""} onChange={(event) => setPlanEditor({ ...planEditor, draft: { ...planEditor.draft, intervalDays: Number(event.target.value) } })} required /></label>}
              <label>Next due date<input type="date" value={planEditor.draft.nextDueDate} onChange={(event) => setPlanEditor({ ...planEditor, draft: { ...planEditor.draft, nextDueDate: event.target.value } })} required /></label>
              <label>Alert threshold (days)<input type="number" min={0} max={365} value={planEditor.draft.thresholdDays} onChange={(event) => setPlanEditor({ ...planEditor, draft: { ...planEditor.draft, thresholdDays: Number(event.target.value) } })} required /></label>
              <label className="form-span">Description<textarea value={planEditor.draft.description ?? ""} onChange={(event) => setPlanEditor({ ...planEditor, draft: { ...planEditor.draft, description: event.target.value } })} rows={3} maxLength={1000} /></label>
              <label className="checkbox-field form-span"><input type="checkbox" checked={planEditor.draft.isActive} onChange={(event) => setPlanEditor({ ...planEditor, draft: { ...planEditor.draft, isActive: event.target.checked } })} /> Plan is active</label>
            </div>
            <EditorActions saving={saving} onCancel={() => setPlanEditor(null)} />
          </form>
        </section>
      )}
    </section>
  );
}

function EditorHeading({ title, id, onClose }: { title: string; id: string; onClose: () => void }) {
  return <div className="editor-heading"><div><p className="eyebrow">Asset record</p><h2 id={id}>{title}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Close editor"><X aria-hidden="true" /></button></div>;
}

function EditorActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return <div className="editor-actions"><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button button-with-icon" disabled={saving} type="submit"><Save aria-hidden="true" />{saving ? "Saving..." : "Save record"}</button></div>;
}
