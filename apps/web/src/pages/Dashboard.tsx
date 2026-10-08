import { AlertTriangle, ClipboardList, Database, FileText, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "../components/StatusBadge";
import { getHealth } from "../services/api";

type ApiState = "checking" | "online" | "offline";

const roleCards = [
  {
    title: "Admin",
    text: "Users, roles, settings, and audit logs."
  },
  {
    title: "Owner",
    text: "Assets, approvals, evidence, costs, and reports."
  },
  {
    title: "Manager",
    text: "Operations, assignments, verification, and deadlines."
  },
  {
    title: "Machine Operator",
    text: "Assigned machinery, parts, dates, and provider approval."
  },
  {
    title: "Service Provider",
    text: "Approved work orders, progress, and completion evidence."
  }
];

const workflowItems = [
  {
    icon: Database,
    title: "Machine Records",
    text: "Store machinery, parts, warranty dates, and replacement dates."
  },
  {
    icon: AlertTriangle,
    title: "Due Alerts",
    text: "Create threshold alerts before maintenance or warranty deadlines."
  },
  {
    icon: ClipboardList,
    title: "Work Orders",
    text: "Share approved tasks with service providers and track completion."
  },
  {
    icon: FileText,
    title: "Reports",
    text: "Generate daily and monthly CSV/PDF maintenance reports."
  }
];

export function Dashboard() {
  const [apiState, setApiState] = useState<ApiState>("checking");

  useEffect(() => {
    getHealth()
      .then(() => setApiState("online"))
      .catch(() => setApiState("offline"));
  }, []);

  return (
    <main className="dashboard">
      <section className="hero-band">
        <div>
          <p className="eyebrow">University of Colombo - Faculty of Technology</p>
          <h1>Maintenance Request Reporting System</h1>
          <p className="hero-copy">
            A role-based platform for machinery records, warranty tracking, preventive maintenance, external service work,
            evidence, and daily/monthly reports.
          </p>
        </div>
        <div className="hero-panel" aria-label="System status">
          <div className="panel-icon">
            <Wrench aria-hidden="true" />
          </div>
          <StatusBadge status={apiState} />
          <p>Milestone 1 foundation is ready for authentication, CRUD workflows, alerts, and reports.</p>
        </div>
      </section>

      <section className="content-grid">
        <div className="section-block">
          <div className="section-heading">
            <ShieldCheck aria-hidden="true" />
            <div>
              <h2>Role Experiences</h2>
              <p>Five controlled experiences keep responsibilities clear for the demo and Q&A.</p>
            </div>
          </div>
          <div className="role-grid">
            {roleCards.map((role) => (
              <article className="role-card" key={role.title}>
                <h3>{role.title}</h3>
                <p>{role.text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="section-block">
          <div className="section-heading">
            <ClipboardList aria-hidden="true" />
            <div>
              <h2>Core Workflow</h2>
              <p>The MVP is built around records, deadline checks, approvals, evidence, and reports.</p>
            </div>
          </div>
          <div className="workflow-list">
            {workflowItems.map((item) => (
              <article className="workflow-item" key={item.title}>
                <item.icon aria-hidden="true" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
