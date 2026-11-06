import { AlertTriangle, ClipboardList, Database, LogOut, ShieldCheck, Users, Wrench } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  createUser,
  getDashboardSummary,
  getUsers,
  logout,
  updateUser,
  type DashboardSummary,
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

type DashboardProps = {
  user: User;
  onLoggedOut: () => void;
};

export function Dashboard({ user, onLoggedOut }: DashboardProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("MACHINE_OPERATOR");

  useEffect(() => {
    getDashboardSummary().then(setSummary).catch((requestError: Error) => setError(requestError.message));
    if (user.role === "ADMIN") {
      getUsers().then((response) => setUsers(response.users)).catch((requestError: Error) => setError(requestError.message));
    }
  }, [user.role]);

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

      <section className="dashboard-content">
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
      </section>
    </main>
  );
}
