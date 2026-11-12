import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertWorkspace } from "../pages/AlertWorkspace";
import type { MaintenanceAlert, Role, User } from "../services/api";

const openAlert: MaintenanceAlert = {
  id: "alert-1",
  type: "MAINTENANCE_DUE",
  status: "OPEN",
  dueDate: "2026-11-12T00:00:00.000Z",
  message: "Monthly lubrication is due",
  acknowledgedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  paymentWorkOrderId: null,
  machine: {
    id: "machine-1",
    assetCode: "M-001",
    name: "Workshop Lathe",
    location: "Main Workshop",
    operatorId: "operator-1"
  },
  part: null,
  plan: { id: "plan-1", title: "Monthly lubrication" }
};

const summary = { open: 1, acknowledged: 0, overdue: 0, dueSoon: 1 };

function currentUser(role: Role): User {
  return {
    id: `${role.toLowerCase()}-1`,
    name: `${role} User`,
    email: `${role.toLowerCase()}@example.com`,
    role,
    isActive: true
  };
}

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}

describe("AlertWorkspace", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches the alert register from the alerts API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ alerts: [openAlert], summary }));

    render(<AlertWorkspace user={currentUser("OWNER")} />);

    expect(await screen.findByText("Monthly lubrication is due")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/alerts", expect.objectContaining({ credentials: "include" }));
    expect(screen.getByText("M-001 · Workshop Lathe")).toBeInTheDocument();
  });

  it("acknowledges an open alert and refreshes the register", async () => {
    let acknowledged = false;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";

      if (path === "/api/alerts/alert-1/acknowledge" && method === "PATCH") {
        acknowledged = true;
        return response({ alert: { ...openAlert, status: "ACKNOWLEDGED", acknowledgedAt: "2026-11-09T12:00:00.000Z" } });
      }
      if (path === "/api/alerts" && method === "GET") {
        return response({
          alerts: [{ ...openAlert, status: acknowledged ? "ACKNOWLEDGED" : "OPEN", acknowledgedAt: acknowledged ? "2026-11-09T12:00:00.000Z" : null }],
          summary: acknowledged ? { ...summary, open: 0, acknowledged: 1 } : summary
        });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<AlertWorkspace user={currentUser("MACHINE_OPERATOR")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => {
      return new URL(String(input)).pathname === "/api/alerts/alert-1/acknowledge" && init?.method === "PATCH";
    })).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument());
    expect(screen.getAllByText("Acknowledged").length).toBeGreaterThan(1);
  });

  it("reopens an acknowledged alert", async () => {
    let reopened = false;
    const acknowledgedAlert = { ...openAlert, status: "ACKNOWLEDGED" as const, acknowledgedAt: "2026-11-09T12:00:00.000Z" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/alerts/alert-1/reopen" && method === "PATCH") {
        reopened = true;
        return response({ alert: openAlert });
      }
      if (path === "/api/alerts" && method === "GET") {
        return response({
          alerts: [reopened ? openAlert : acknowledgedAlert],
          summary: reopened ? summary : { ...summary, open: 0, acknowledged: 1 }
        });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<AlertWorkspace user={currentUser("MACHINE_OPERATOR")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reopen" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => {
      return new URL(String(input)).pathname === "/api/alerts/alert-1/reopen" && init?.method === "PATCH";
    })).toBe(true));
    expect(await screen.findByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
  });

  it("starts a categorized service request from an operator alert", async () => {
    const onCreateServiceRequest = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ alerts: [openAlert], summary }));

    render(<AlertWorkspace user={currentUser("MACHINE_OPERATOR")} onCreateServiceRequest={onCreateServiceRequest} />);
    fireEvent.click(await screen.findByRole("button", { name: "Create service request" }));

    expect(onCreateServiceRequest).toHaveBeenCalledWith({
      machineId: "machine-1",
      sourceAlertId: "alert-1",
      title: "Monthly lubrication is due",
      category: "PREVENTIVE_MAINTENANCE"
    });
  });

  it.each(["ADMIN", "MANAGER"] as const)("shows scheduler controls to %s users", async (role) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ alerts: [], summary: { ...summary, open: 0, dueSoon: 0 } }));
    render(<AlertWorkspace user={currentUser(role)} />);

    expect(await screen.findByRole("button", { name: "Run checks" })).toBeInTheDocument();
  });

  it.each(["OWNER", "MACHINE_OPERATOR"] as const)("hides scheduler controls from %s users", async (role) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ alerts: [], summary: { ...summary, open: 0, dueSoon: 0 } }));
    render(<AlertWorkspace user={currentUser(role)} />);

    expect(await screen.findByText("No alerts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run checks" })).not.toBeInTheDocument();
  });

  it("does not render or request alerts for service providers", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { container } = render(<AlertWorkspace user={currentUser("SERVICE_PROVIDER")} />);

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs scheduler checks and refreshes alerts for administrators", async () => {
    let getCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/alerts/run-scheduler" && method === "POST") {
        return response({ result: { created: 2, existing: 1, resolved: 1, evaluatedAt: "2026-11-09T12:00:00.000Z" } });
      }
      if (path === "/api/alerts" && method === "GET") {
        getCount += 1;
        return response({ alerts: getCount > 1 ? [openAlert] : [], summary: getCount > 1 ? summary : { open: 0, acknowledged: 0, overdue: 0, dueSoon: 0 } });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<AlertWorkspace user={currentUser("ADMIN")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Run checks" }));

    expect(await screen.findByText(/2 created, 1 unchanged, 1 resolved/i)).toBeInTheDocument();
    expect(await screen.findByText("Monthly lubrication is due")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === "/api/alerts")).toHaveLength(2);
  });

  it("shows an empty state when there are no alerts", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ alerts: [], summary: { open: 0, acknowledged: 0, overdue: 0, dueSoon: 0 } }));
    render(<AlertWorkspace user={currentUser("OWNER")} />);

    expect(await screen.findByText("No alerts")).toBeInTheDocument();
    expect(screen.getByText("All monitored maintenance dates are clear.")).toBeInTheDocument();
  });

  it("shows an error state with a retry action", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ message: "Alert service unavailable" }, 503));
    render(<AlertWorkspace user={currentUser("OWNER")} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Alert service unavailable");
    expect(screen.getByText("Alerts unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
