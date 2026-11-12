import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  PackageSearch,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Wrench
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  acknowledgeAlert,
  getAlerts,
  reopenAlert,
  runAlertScheduler,
  type AlertStatus,
  type AlertSummary,
  type AlertType,
  type MaintenanceAlert,
  type User
} from "../services/api";

type AlertWorkspaceProps = {
  user: User;
  onCreateServiceRequest?: (request: {
    machineId: string;
    sourceAlertId: string;
    title: string;
    category: "PREVENTIVE_MAINTENANCE" | "WARRANTY_SERVICE" | "PART_REPLACEMENT" | "OTHER";
  }) => void;
};

const typeLabels: Record<AlertType, string> = {
  MACHINE_WARRANTY: "Machine warranty",
  PART_WARRANTY: "Part warranty",
  PART_REPLACEMENT: "Part replacement",
  MAINTENANCE_DUE: "Maintenance due",
  PAYMENT_APPROVAL: "Payment approval"
};

const statusLabels: Record<AlertStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  RESOLVED: "Resolved"
};

const alertIcons = {
  MACHINE_WARRANTY: ShieldAlert,
  PART_WARRANTY: PackageSearch,
  PART_REPLACEMENT: Wrench,
  MAINTENANCE_DUE: CalendarClock,
  PAYMENT_APPROVAL: CheckCheck
} satisfies Record<AlertType, typeof AlertTriangle>;

const requestCategory: Record<Exclude<AlertType, "PAYMENT_APPROVAL">, "PREVENTIVE_MAINTENANCE" | "WARRANTY_SERVICE" | "PART_REPLACEMENT"> = {
  MACHINE_WARRANTY: "WARRANTY_SERVICE",
  PART_WARRANTY: "WARRANTY_SERVICE",
  PART_REPLACEMENT: "PART_REPLACEMENT",
  MAINTENANCE_DUE: "PREVENTIVE_MAINTENANCE"
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function timingLabel(alert: MaintenanceAlert) {
  if (alert.status === "RESOLVED") return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(alert.dueDate);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { label: `${Math.abs(days)}d overdue`, className: "overdue" };
  return { label: days === 0 ? "Due today" : `Due in ${days}d`, className: "due-soon" };
}

export function AlertWorkspace(props: AlertWorkspaceProps) {
  if (props.user.role === "SERVICE_PROVIDER") return null;
  return <AlertWorkspaceContent {...props} />;
}

function AlertWorkspaceContent({ user, onCreateServiceRequest }: AlertWorkspaceProps) {
  const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
  const [summary, setSummary] = useState<AlertSummary>({ open: 0, acknowledged: 0, overdue: 0, dueSoon: 0 });
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<AlertType | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [schedulerMessage, setSchedulerMessage] = useState("");

  const canRunScheduler = user.role === "ADMIN" || user.role === "MANAGER";

  const loadAlerts = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await getAlerts();
      setAlerts(response.alerts);
      setSummary(response.summary);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load alerts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const filteredAlerts = useMemo(() => alerts.filter((alert) => {
    return (statusFilter === "ALL" || alert.status === statusFilter)
      && (typeFilter === "ALL" || alert.type === typeFilter);
  }), [alerts, statusFilter, typeFilter]);

  async function handleAcknowledge(alert: MaintenanceAlert) {
    setBusyAlertId(alert.id);
    setError("");

    try {
      await acknowledgeAlert(alert.id);
      await loadAlerts(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to acknowledge alert");
    } finally {
      setBusyAlertId(null);
    }
  }

  async function handleReopen(alert: MaintenanceAlert) {
    setBusyAlertId(alert.id);
    setError("");
    try {
      await reopenAlert(alert.id);
      await loadAlerts(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reopen alert");
    } finally {
      setBusyAlertId(null);
    }
  }

  async function handleRunScheduler() {
    setSchedulerRunning(true);
    setSchedulerMessage("");
    setError("");

    try {
      const { result } = await runAlertScheduler();
      setSchedulerMessage(`Checks complete: ${result.created} created, ${result.existing} unchanged, ${result.resolved} resolved.`);
      await loadAlerts(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to run alert checks");
    } finally {
      setSchedulerRunning(false);
    }
  }

  const summaryItems = [
    { label: "Open", value: summary.open, icon: AlertCircle, tone: "open" },
    { label: "Acknowledged", value: summary.acknowledged, icon: CheckCheck, tone: "acknowledged" },
    { label: "Overdue", value: summary.overdue, icon: AlertTriangle, tone: "overdue" },
    { label: "Due soon", value: summary.dueSoon, icon: Clock3, tone: "due-soon" }
  ];

  return (
    <section className="alert-workspace">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Maintenance attention</p>
          <h1>Alerts</h1>
          <p className="muted">Review upcoming maintenance, replacement, and warranty deadlines.</p>
        </div>
        <div className="workspace-heading-actions">
          <button className="secondary-button button-with-icon" type="button" onClick={() => void loadAlerts(true)} disabled={refreshing || loading}>
            <RefreshCw aria-hidden="true" className={refreshing ? "spin-icon" : undefined} /> Refresh
          </button>
          {canRunScheduler && (
            <button className="primary-button button-with-icon" type="button" onClick={handleRunScheduler} disabled={schedulerRunning}>
              <Play aria-hidden="true" /> {schedulerRunning ? "Running checks..." : "Run checks"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="form-error workspace-error" role="alert">{error}</p>}
      {schedulerMessage && <p className="scheduler-result" role="status"><Check aria-hidden="true" /> {schedulerMessage}</p>}

      <div className="alert-summary-grid" aria-label="Alert summary">
        {summaryItems.map((item) => (
          <article className={`alert-summary-card ${item.tone}`} key={item.label}>
            <item.icon aria-hidden="true" />
            <div><strong>{loading ? "-" : item.value}</strong><span>{item.label}</span></div>
          </article>
        ))}
      </div>

      <div className="alert-panel">
        <div className="alert-toolbar">
          <div>
            <strong>Alert register</strong>
            <span>{filteredAlerts.length} of {alerts.length} alerts</span>
          </div>
          <div className="alert-filters">
            <label>Status<span className="sr-only"> filter</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AlertStatus | "ALL")}>
                <option value="ALL">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>Type<span className="sr-only"> filter</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as AlertType | "ALL")}>
                <option value="ALL">All types</option>
                {Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="workspace-state alert-state"><span className="loading-mark small" aria-hidden="true" /><strong>Loading alerts</strong></div>
        ) : error && alerts.length === 0 ? (
          <div className="workspace-state alert-state"><AlertCircle aria-hidden="true" /><strong>Alerts unavailable</strong><span>Check the connection and try again.</span><button className="secondary-button" type="button" onClick={() => void loadAlerts()}>Try again</button></div>
        ) : alerts.length === 0 && !error ? (
          <div className="workspace-state alert-state"><CheckCheck aria-hidden="true" /><strong>No alerts</strong><span>All monitored maintenance dates are clear.</span></div>
        ) : filteredAlerts.length === 0 ? (
          <div className="workspace-state alert-state"><CircleAlert aria-hidden="true" /><strong>No matching alerts</strong><span>Adjust the status or type filters to see other records.</span></div>
        ) : (
          <div className="alert-list">
            {filteredAlerts.map((alert) => {
              const AlertIcon = alertIcons[alert.type];
              const timing = timingLabel(alert);
              return (
                <article className={`alert-row status-${alert.status.toLowerCase()}`} key={alert.id}>
                  <span className={`alert-type-icon type-${alert.type.toLowerCase()}`}><AlertIcon aria-hidden="true" /></span>
                  <div className="alert-main">
                    <div className="alert-title-line">
                      <span className="alert-type-label">{typeLabels[alert.type]}</span>
                      <span className={`alert-status status-${alert.status.toLowerCase()}`}>{statusLabels[alert.status]}</span>
                      {timing && <span className={`timing-badge ${timing.className}`}>{timing.label}</span>}
                    </div>
                    <strong>{alert.message}</strong>
                    <div className="alert-context">
                      <span>{alert.machine.assetCode} · {alert.machine.name}</span>
                      <span>{alert.machine.location}</span>
                      {alert.part && <span>Part: {alert.part.name}{alert.part.partNumber ? ` (${alert.part.partNumber})` : ""}</span>}
                      {alert.plan && <span>Plan: {alert.plan.title}</span>}
                    </div>
                  </div>
                  <div className="alert-due">
                    <span>Due date</span>
                    <strong>{formatDate(alert.dueDate)}</strong>
                  </div>
                  <div className="alert-actions">
                    {alert.status === "OPEN" && (
                      <button className="secondary-button button-with-icon" type="button" onClick={() => handleAcknowledge(alert)} disabled={busyAlertId === alert.id}>
                        <Check aria-hidden="true" /> {busyAlertId === alert.id ? "Saving..." : "Acknowledge"}
                      </button>
                    )}
                    {alert.status === "ACKNOWLEDGED" && (
                      <button className="secondary-button button-with-icon" type="button" onClick={() => handleReopen(alert)} disabled={busyAlertId === alert.id}>
                        <RotateCcw aria-hidden="true" /> {busyAlertId === alert.id ? "Saving..." : "Reopen"}
                      </button>
                    )}
                    {user.role === "MACHINE_OPERATOR" && alert.status !== "RESOLVED" && alert.type !== "PAYMENT_APPROVAL" && onCreateServiceRequest && (
                      <button className="primary-button button-with-icon" type="button" onClick={() => onCreateServiceRequest({
                        machineId: alert.machine.id,
                        sourceAlertId: alert.id,
                        title: alert.message,
                        category: requestCategory[alert.type as Exclude<AlertType, "PAYMENT_APPROVAL">]
                      })}>
                        <Wrench aria-hidden="true" /> Create service request
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
