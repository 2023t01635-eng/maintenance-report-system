import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  ReceiptText,
  RefreshCw
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDashboardPayments, type PaymentDashboard, type User } from "../services/api";

type PaymentWorkspaceProps = { user: User };

function displayMoney(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2
  }).format(value);
}

function displayDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value));
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" })
    .format(new Date(`${value}-01T00:00:00`));
}

function varianceTone(value: number, isProvider: boolean) {
  if (value === 0) return "";
  const isFavorable = isProvider ? value > 0 : value < 0;
  return isFavorable ? "favorable" : "unfavorable";
}

export function PaymentWorkspace({ user }: PaymentWorkspaceProps) {
  const [data, setData] = useState<PaymentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getDashboardPayments());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load payment records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const isProvider = user.role === "SERVICE_PROVIDER";
  const maxMonthly = useMemo(() => Math.max(
    1,
    ...(data?.monthly.flatMap((item) => [item.paymentTotal, item.budgetTotal]) ?? [1])
  ), [data?.monthly]);
  const variance = data?.summary.netVariance ?? 0;
  const metrics = [
    {
      label: isProvider ? "Approved cash inflow" : "Approved cash outflow",
      value: displayMoney(data?.summary.paymentTotal ?? 0),
      icon: isProvider ? ArrowUpRight : ArrowDownRight
    },
    { label: "Completed payments", value: data?.summary.paymentCount ?? 0, icon: ClipboardCheck },
    { label: "Current budget total", value: displayMoney(data?.summary.budgetTotal ?? 0), icon: CircleDollarSign },
    {
      label: variance > 0 ? "Total above budget" : variance < 0 ? "Total below budget" : "Budget variance",
      value: displayMoney(Math.abs(variance)),
      icon: BarChart3,
      tone: varianceTone(variance, isProvider)
    }
  ];

  return (
    <section className="payment-workspace" aria-labelledby="payments-heading">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Financial activity</p>
          <h1 id="payments-heading">Payments</h1>
          <p className="muted">{isProvider
            ? "Review approved income from your completed services and compare it with each negotiated budget."
            : "Review finalized maintenance spending, replaced parts, approval details, and budget performance."}</p>
        </div>
        <button className="secondary-button button-with-icon" type="button" onClick={() => void loadPayments()} disabled={loading}>
          <RefreshCw aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && <p className="form-error workspace-error" role="alert">{error}</p>}

      <div className="payment-metric-grid">
        {metrics.map((metric) => <article className={"tone" in metric ? metric.tone : undefined} key={metric.label}><metric.icon aria-hidden="true" /><div><strong>{loading ? "-" : metric.value}</strong><span>{metric.label}</span></div></article>)}
      </div>

      <section className="payment-chart-section" aria-labelledby="payment-chart-heading">
        <div className="section-heading">
          <div><p className="eyebrow">Monthly comparison</p><h2 id="payment-chart-heading">Payment value against budget</h2></div>
          <div className="payment-chart-legend"><span><i className="actual" />{isProvider ? "Inflow" : "Outflow"}</span><span><i className="budget" />Budget</span></div>
        </div>
        {loading ? <div className="workspace-state"><span className="loading-mark" />Loading payment chart...</div> : !data?.monthly.length ? <div className="payment-empty"><BarChart3 aria-hidden="true" /><div><strong>No finalized payment data</strong><span>The chart will appear after a payment is approved and its work order is closed.</span></div></div> : <div className="payment-chart" role="img" aria-label={`Monthly ${isProvider ? "cash inflow" : "cash outflow"} compared with budget`}>
          {data.monthly.map((item) => <div className="payment-chart-group" key={item.month}>
            <div className="payment-bars">
              <span className="payment-bar actual" style={{ height: `${Math.max(3, item.paymentTotal / maxMonthly * 100)}%` }} title={`${isProvider ? "Inflow" : "Outflow"}: ${displayMoney(item.paymentTotal)}`} />
              <span className="payment-bar budget" style={{ height: `${Math.max(3, item.budgetTotal / maxMonthly * 100)}%` }} title={`Budget: ${displayMoney(item.budgetTotal)}`} />
            </div>
            <strong>{monthLabel(item.month)}</strong>
            <span>{item.count} payment{item.count === 1 ? "" : "s"}</span>
          </div>)}
        </div>}
      </section>

      <section className="payment-records" aria-labelledby="payment-records-heading">
        <div className="section-heading"><div><p className="eyebrow">Payment ledger</p><h2 id="payment-records-heading">Finalized service payments</h2></div><span>{data?.payments.length ?? 0} records</span></div>
        {loading ? <div className="workspace-state"><span className="loading-mark" />Loading payments...</div> : !data?.payments.length ? <div className="payment-empty"><ReceiptText aria-hidden="true" /><div><strong>No finalized payments</strong><span>Closed and approved service payments will appear here.</span></div></div> : <div className="data-table-wrap"><table className="data-table payment-table">
          <thead><tr><th>Date / reference</th><th>Machine</th>{!isProvider && <th>Service provider</th>}<th>Replaced parts</th><th>Approved by</th><th>Budget</th><th>{isProvider ? "Cash inflow" : "Cash outflow"}</th><th>Variance</th></tr></thead>
          <tbody>{data.payments.map((payment) => <tr key={payment.id}>
            <td><strong>{displayDate(payment.paymentApprovedAt)}</strong><span>{payment.paymentReference ?? payment.id.slice(0, 8).toUpperCase()}</span></td>
            <td><strong>{payment.machine.assetCode}</strong><span>{payment.machine.name}</span></td>
            {!isProvider && <td><strong>{payment.provider?.name ?? "Not recorded"}</strong><span>{payment.provider?.email ?? ""}</span></td>}
            <td>{payment.parts.length ? <ul className="payment-parts">{payment.parts.map((part) => <li key={part.id}><strong>{part.quantity} x {part.partName}</strong><span>{displayMoney(part.lineTotal)}</span></li>)}</ul> : <span>No replacement parts</span>}</td>
            <td><strong>{payment.approvedBy?.name ?? "Not recorded"}</strong><span>{payment.approvedBy?.role?.replaceAll("_", " ") ?? ""}</span></td>
            <td>{displayMoney(payment.proposedBudget)}</td>
            <td><strong>{displayMoney(payment.paymentValue)}</strong><span>Labour {displayMoney(payment.serviceCost)} | Parts {displayMoney(payment.partsTotal)}</span></td>
            <td><span className={`payment-variance ${varianceTone(payment.variance, isProvider)}`.trim()}>{payment.variance > 0 ? `${displayMoney(payment.variance)} over` : payment.variance < 0 ? `${displayMoney(Math.abs(payment.variance))} under` : "On budget"}</span></td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </section>
  );
}
