import { Activity, AlertTriangle, Boxes, Building2, ClipboardList, Database, LayoutDashboard, LogOut, Save, ShieldCheck, Users, WalletCards, Wrench } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AssetWorkspace } from "./AssetWorkspace";
import { AlertWorkspace } from "./AlertWorkspace";
import { WorkOrderWorkspace, type NewServiceRequest } from "./WorkOrderWorkspace";
import { PaymentWorkspace } from "./PaymentWorkspace";
import {
  createUser,
  getDashboardActivity,
  getDashboardSummary,
  getOrganizationProfile,
  getUsers,
  logout,
  updateOrganizationProfile,
  updateUser,
  type ActivityEvent,
  type DashboardSummary,
  type OrganizationProfile,
  type Role,
  type User
} from "../services/api";

const roleLabels: Record<Role, string> = {
  ADMIN: "Administrator",
  OWNER: "Owner",
  MANAGER: "Manager",
  MACHINE_OPERATOR: "Machine Operator",
  SERVICE_PROVIDER: "Service Provider"
};

const roles = Object.keys(roleLabels) as Role[];

const activityLabels: Record<string, string> = {
  MACHINE_CREATED: "registered a machine",
  MACHINE_UPDATED: "updated machine details",
  MACHINE_DELETED: "removed a machine",
  MACHINE_PART_CREATED: "added a machine part",
  MACHINE_PART_UPDATED: "updated a machine part",
  MACHINE_PART_DELETED: "removed a machine part",
  MAINTENANCE_PLAN_CREATED: "created a maintenance plan",
  MAINTENANCE_PLAN_UPDATED: "updated a maintenance plan",
  MAINTENANCE_PLAN_DELETED: "removed a maintenance plan",
  ALERT_ACKNOWLEDGED: "acknowledged an alert",
  ALERT_REOPENED: "reopened an alert",
  WORK_ORDER_CREATED: "created a service request",
  WORK_ORDER_UPDATED: "updated a service request",
  WORK_ORDER_SUBMITTED: "submitted a service request",
  WORK_ORDER_APPROVED_AND_DISPATCHED: "approved and dispatched a service request",
  WORK_ORDER_PROVIDER_ACCEPTED: "accepted a service request",
  WORK_ORDER_STARTED: "started service work",
  WORK_ORDER_SERVICE_DETAILS_UPDATED: "updated service and receipt details",
  WORK_ORDER_REPLACEMENT_ADDED: "recorded a replacement part",
  WORK_ORDER_REPLACEMENT_UPDATED: "updated a replacement part",
  WORK_ORDER_REPLACEMENT_REMOVED: "removed a replacement line",
  SERVICE_EVIDENCE_ADDED: "added service evidence",
  WORK_ORDER_COMPLETION_SUBMITTED: "submitted service completion",
  WORK_ORDER_PAYMENT_APPROVED: "approved payment and closed a request",
  WORK_ORDER_PAYMENT_COUNTERED: "sent a price counteroffer",
  WORK_ORDER_REJECTED: "rejected a service request",
  WORK_ORDER_CANCELLED: "cancelled a service request",
  ORGANIZATION_PROFILE_UPDATED: "updated the receipt identity"
};

function activityDescription(action: string) {
  return activityLabels[action] ?? action.toLowerCase().replaceAll("_", " ");
}

function activityDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

type DashboardProps = {
  user: User;
  onLoggedOut: () => void;
};

export function Dashboard({ user, onLoggedOut }: DashboardProps) {
  const [activeView, setActiveView] = useState<"overview" | "assets" | "alerts" | "work-orders" | "payments">("overview");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("MACHINE_OPERATOR");
  const [newServiceRequest, setNewServiceRequest] = useState<NewServiceRequest | null>(null);

  function createServiceRequest(request: NewServiceRequest) {
    setNewServiceRequest(request);
    setActiveView("work-orders");
  }

  useEffect(() => {
    getDashboardSummary().then(setSummary).catch((requestError: Error) => setError(requestError.message));
    getDashboardActivity().then((response) => setActivity(response.events)).catch((requestError: Error) => setError(requestError.message));
    getOrganizationProfile().then((response) => setOrganization(response.profile)).catch((requestError: Error) => setError(requestError.message));
    if (user.role === "ADMIN") {
      getUsers().then((response) => setUsers(response.users)).catch((requestError: Error) => setError(requestError.message));
    }
  }, [user.role]);

  async function handleOrganizationSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;
    setSavingOrganization(true);
    setError("");
    try {
      const response = await updateOrganizationProfile({
        companyName: organization.companyName,
        address: organization.address,
        registrationNumber: organization.registrationNumber,
        phone: organization.phone,
        email: organization.email
      });
      setOrganization(response.profile);
      const activityResponse = await getDashboardActivity();
      setActivity(activityResponse.events);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save organization details");
    } finally {
      setSavingOrganization(false);
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const response = await createUser({ name, email, password, role });
      setUsers((current) => [...current, response.user].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setEmail("");
      setPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create user");
    }
  }

  async function toggleUser(target: User) {
    try {
      const response = await updateUser(target.id, { isActive: !target.isActive });
      setUsers((current) => current.map((item) => (item.id === target.id ? response.user : item)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update user");
    }
  }

  const metrics = [
    { label: "Machines", value: summary?.totals.machines ?? "-", icon: Database },
    { label: "Open alerts", value: summary?.totals.openAlerts ?? "-", icon: AlertTriangle },
    { label: "Active work orders", value: summary?.totals.activeWorkOrders ?? "-", icon: ClipboardList },
    { label: "Active users", value: summary?.totals.activeUsers ?? "-", icon: Users }
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-title">
          <span className="compact-mark"><Wrench aria-hidden="true" /></span>
          <div><strong>Maintenance Report System</strong><span>Faculty of Technology</span></div>
        </div>
        <div className="account-actions">
          <div><strong>{user.name}</strong><span>{roleLabels[user.role]}</span></div>
          <button className="icon-button" onClick={handleLogout} type="button" title="Sign out" aria-label="Sign out"><LogOut aria-hidden="true" /></button>
        </div>
      </header>

      <nav className="workspace-nav" aria-label="Main workspace">
        <button className={activeView === "overview" ? "active" : ""} type="button" onClick={() => setActiveView("overview")} aria-current={activeView === "overview" ? "page" : undefined}>
          <LayoutDashboard aria-hidden="true" /> Overview
        </button>
        {user.role !== "SERVICE_PROVIDER" && (
          <>
            <button className={activeView === "assets" ? "active" : ""} type="button" onClick={() => setActiveView("assets")} aria-current={activeView === "assets" ? "page" : undefined}>
              <Boxes aria-hidden="true" /> Assets
            </button>
            <button className={activeView === "alerts" ? "active" : ""} type="button" onClick={() => setActiveView("alerts")} aria-current={activeView === "alerts" ? "page" : undefined}>
              <AlertTriangle aria-hidden="true" /> Alerts
            </button>
          </>
        )}
        <button className={activeView === "work-orders" ? "active" : ""} type="button" onClick={() => setActiveView("work-orders")} aria-current={activeView === "work-orders" ? "page" : undefined}>
          <ClipboardList aria-hidden="true" /> Work Orders
        </button>
        {user.role !== "MACHINE_OPERATOR" && <button className={activeView === "payments" ? "active" : ""} type="button" onClick={() => setActiveView("payments")} aria-current={activeView === "payments" ? "page" : undefined}>
          <WalletCards aria-hidden="true" /> Payments
        </button>}
      </nav>

      <section className="dashboard-content">
        {activeView === "assets" && user.role !== "SERVICE_PROVIDER" ? <AssetWorkspace user={user} /> : activeView === "alerts" && user.role !== "SERVICE_PROVIDER" ? <AlertWorkspace user={user} onCreateServiceRequest={createServiceRequest} /> : activeView === "work-orders" ? <WorkOrderWorkspace user={user} initialRequest={newServiceRequest} onInitialRequestConsumed={() => setNewServiceRequest(null)} /> : activeView === "payments" && user.role !== "MACHINE_OPERATOR" ? <PaymentWorkspace user={user} /> : <>
          <div className="welcome-row">
          <div>
            <p className="eyebrow">{roleLabels[user.role]} workspace</p>
            <h1>Maintenance overview</h1>
            <p className="muted">Monitor the records and work currently available to your role.</p>
          </div>
          <span className="access-badge"><ShieldCheck aria-hidden="true" /> Secure session</span>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="metric-grid">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <metric.icon aria-hidden="true" />
              <div><strong>{metric.value}</strong><span>{metric.label}</span></div>
            </article>
          ))}
        </div>

        <section className="activity-section" aria-labelledby="activity-heading">
          <div className="section-heading">
            <div><p className="eyebrow">Audit trail</p><h2 id="activity-heading">Recent activity</h2></div>
            <span>{activity.length} recent events</span>
          </div>
          {activity.length === 0 ? (
            <div className="activity-empty"><Activity aria-hidden="true" /><div><strong>No activity yet</strong><span>Actions available to your role will appear here.</span></div></div>
          ) : (
            <div className="activity-list">
              {activity.map((event) => (
                <article key={event.id}>
                  <span className="activity-icon"><Activity aria-hidden="true" /></span>
                  <div><strong>{event.actor?.name ?? "System"} {activityDescription(event.action)}</strong><span>{event.entityType.replace(/([a-z])([A-Z])/g, "$1 $2")}</span></div>
                  <time dateTime={event.createdAt}>{activityDate(event.createdAt)}</time>
                </article>
              ))}
            </div>
          )}
        </section>

          {user.role === "ADMIN" && organization && (
          <section className="admin-section organization-section">
            <div className="section-heading">
              <div><p className="eyebrow">Reports and receipts</p><h2>Organization identity</h2></div>
              <Building2 aria-hidden="true" />
            </div>
            <form className="organization-form" onSubmit={handleOrganizationSave}>
              <label>Organization name<input value={organization.companyName} onChange={(event) => setOrganization({ ...organization, companyName: event.target.value })} required minLength={2} maxLength={180} /></label>
              <label>Registration number<input value={organization.registrationNumber ?? ""} onChange={(event) => setOrganization({ ...organization, registrationNumber: event.target.value || null })} maxLength={120} /></label>
              <label className="form-span">Address<textarea value={organization.address ?? ""} onChange={(event) => setOrganization({ ...organization, address: event.target.value || null })} rows={3} maxLength={500} /></label>
              <label>Phone<input value={organization.phone ?? ""} onChange={(event) => setOrganization({ ...organization, phone: event.target.value || null })} maxLength={80} /></label>
              <label>Email<input type="email" value={organization.email ?? ""} onChange={(event) => setOrganization({ ...organization, email: event.target.value || null })} maxLength={180} /></label>
              <div className="organization-actions form-span"><button className="primary-button button-with-icon" type="submit" disabled={savingOrganization}><Save aria-hidden="true" /> {savingOrganization ? "Saving..." : "Save receipt identity"}</button></div>
            </form>
          </section>
          )}

          {user.role === "ADMIN" && (
          <section className="admin-section">
            <div className="section-heading">
              <div><p className="eyebrow">Administration</p><h2>User management</h2></div>
              <span>{users.length} accounts</span>
            </div>

            <form className="user-form" onSubmit={handleCreateUser}>
              <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
              <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label>Temporary password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
              <label>Role<select value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></label>
              <button className="primary-button" type="submit">Add user</button>
            </form>

            <div className="user-list">
              {users.map((item) => (
                <article className="user-row" key={item.id}>
                  <div className="user-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</div>
                  <div className="user-identity"><strong>{item.name}</strong><span>{item.email}</span></div>
                  <span className="role-pill">{roleLabels[item.role]}</span>
                  <span className={item.isActive ? "status-active" : "status-inactive"}>{item.isActive ? "Active" : "Inactive"}</span>
                  <button className="secondary-button" disabled={item.id === user.id} onClick={() => toggleUser(item)} type="button">
                    {item.isActive ? "Deactivate" : "Activate"}
                  </button>
                </article>
              ))}
            </div>
          </section>
          )}
        </>}
      </section>
    </main>
  );
}
