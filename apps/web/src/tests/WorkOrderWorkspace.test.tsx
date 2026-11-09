import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkOrderWorkspace } from "../pages/WorkOrderWorkspace";
import type { Machine, Role, ServiceEvidence, User, WorkOrder, WorkOrderStatus } from "../services/api";

const machine: Machine = {
  id: "machine-1",
  assetCode: "M-001",
  name: "Workshop Lathe",
  category: "Machine tool",
  location: "Main Workshop",
  manufacturer: null,
  model: null,
  serialNumber: null,
  warrantyStart: null,
  warrantyEnd: null,
  status: "ACTIVE",
  operatorId: "operator-1",
  operator: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z"
};

function workOrder(status: WorkOrderStatus = "DRAFT", overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "work-order-1",
    machineId: machine.id,
    machine: {
      id: machine.id,
      assetCode: machine.assetCode,
      name: machine.name,
      location: machine.location,
      operatorId: machine.operatorId
    },
    providerId: "provider-1",
    provider: {
      id: "provider-1",
      name: "Reliable Engineering",
      email: "provider@example.com",
      role: "SERVICE_PROVIDER",
      isActive: true
    },
    approvedByOperatorId: status === "DRAFT" || status === "PENDING_OPERATOR_APPROVAL" ? null : "operator-1",
    approvedByOperator: status === "DRAFT" || status === "PENDING_OPERATOR_APPROVAL" ? null : {
      id: "operator-1",
      name: "Assigned Operator",
      email: "operator@example.com"
    },
    title: "Lathe spindle service",
    description: "Inspect and service the spindle assembly.",
    status,
    scheduledDate: "2026-11-18",
    completedDate: status === "COMPLETED" ? "2026-11-19" : null,
    cost: "12500.00",
    notes: "Service during the morning shift.",
    replacedParts: "Drive belt",
    evidence: [],
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
    ...overrides
  };
}

function currentUser(role: Role, id?: string): User {
  return {
    id: id ?? (role === "SERVICE_PROVIDER" ? "provider-1" : role === "MACHINE_OPERATOR" ? "operator-1" : `${role.toLowerCase()}-1`),
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

function installRegister(record: WorkOrder | null, options?: { providers?: Array<WorkOrder["provider"]> }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    if (path === "/api/work-orders" && method === "GET") return response({ workOrders: record ? [record] : [] });
    if (path === "/api/machines" && method === "GET") return response({ machines: [machine] });
    if (path === "/api/work-orders/providers" && method === "GET") {
      return response({ providers: (options?.providers ?? [workOrder().provider]).filter(Boolean) });
    }
    if (path === "/api/work-orders/work-order-1" && method === "GET" && record) return response({ workOrder: record });
    return response({ message: "Not found" }, 404);
  });
}

describe("WorkOrderWorkspace", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a loading state while the register request is pending", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => undefined));
    render(<WorkOrderWorkspace user={currentUser("SERVICE_PROVIDER")} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading work orders");
  });

  it("shows API errors and a retry action", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ message: "Work order service unavailable" }, 503));
    render(<WorkOrderWorkspace user={currentUser("MACHINE_OPERATOR")} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Work order service unavailable");
    expect(screen.getByText("Work orders unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows a role-aware empty state", async () => {
    installRegister(null);
    render(<WorkOrderWorkspace user={currentUser("MACHINE_OPERATOR")} />);

    expect(await screen.findByText("No work orders")).toBeInTheDocument();
    expect(screen.getByText("No work orders are assigned to you.")).toBeInTheDocument();
  });

  it("renders a populated, searchable register with semantic list and detail regions", async () => {
    installRegister(workOrder("COMPLETED"));
    render(<WorkOrderWorkspace user={currentUser("OWNER")} />);

    expect(await screen.findByRole("heading", { name: "Lathe spindle service" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Work order register" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Work order detail" })).toBeInTheDocument();
    expect(screen.getByText("19 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Drive belt")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search orders, assets..."), { target: { value: "no match" } });
    expect(screen.getByText("No matching work orders")).toBeInTheDocument();
  });

  it("shows internal draft controls but keeps evidence read-only", async () => {
    installRegister(workOrder("DRAFT"));
    render(<WorkOrderWorkspace user={currentUser("MANAGER")} />);

    expect(await screen.findByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add evidence" })).not.toBeInTheDocument();
  });

  it("dispatches an approved order to the provider selected by management", async () => {
    const approved = workOrder("APPROVED", { providerId: null, provider: null });
    const secondProvider = {
      id: "provider-2",
      name: "Precision Service",
      email: "precision@example.com",
      role: "SERVICE_PROVIDER" as const,
      isActive: true
    };
    const sent = workOrder("SENT_TO_PROVIDER", { providerId: secondProvider.id, provider: secondProvider });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [approved] });
      if (path === "/api/machines" && method === "GET") return response({ machines: [machine] });
      if (path === "/api/work-orders/providers" && method === "GET") return response({ providers: [secondProvider] });
      if (path === "/api/work-orders/work-order-1" && method === "GET") return response({ workOrder: approved });
      if (path === "/api/work-orders/work-order-1/send-to-provider" && method === "POST") {
        return response({ workOrder: sent });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("MANAGER")} />);
    fireEvent.change(await screen.findByLabelText("Active service provider"), { target: { value: secondProvider.id } });
    fireEvent.click(screen.getByRole("button", { name: "Send to provider" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input, init]) =>
        new URL(String(input)).pathname.endsWith("/send-to-provider") && init?.method === "POST"
      );
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({ providerId: secondProvider.id });
    });
    expect(within(screen.getByRole("article", { name: "Work order detail" })).getByText("Sent to provider")).toBeInTheDocument();
  });

  it("lets the assigned operator approve a pending order", async () => {
    const pending = workOrder("PENDING_OPERATOR_APPROVAL");
    const approved = workOrder("APPROVED");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [pending] });
      if (path === "/api/work-orders/work-order-1" && method === "GET") return response({ workOrder: pending });
      if (path === "/api/work-orders/work-order-1/approve" && method === "POST") return response({ workOrder: approved });
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("MACHINE_OPERATOR")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/work-orders/work-order-1/approve",
      expect.objectContaining({ method: "POST", credentials: "include" })
    ));
    expect(within(screen.getByRole("article", { name: "Work order detail" })).getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("shows provider workflow controls only for the assigned provider", async () => {
    installRegister(workOrder("SENT_TO_PROVIDER"));
    render(<WorkOrderWorkspace user={currentUser("SERVICE_PROVIDER")} />);

    expect(await screen.findByRole("button", { name: "Start work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Service details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add evidence" })).toBeInTheDocument();
  });

  it("hides provider-only controls when the provider is not assigned", async () => {
    installRegister(workOrder("SENT_TO_PROVIDER"));
    render(<WorkOrderWorkspace user={currentUser("SERVICE_PROVIDER", "provider-2")} />);

    await screen.findByRole("heading", { name: "Lathe spindle service" });
    expect(screen.queryByRole("button", { name: "Service details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add evidence" })).not.toBeInTheDocument();
  });

  it("creates an order with strict date-only, cost, and replaced-parts values", async () => {
    let created = false;
    const createdOrder = workOrder("DRAFT", {
      title: "Cooling pump service",
      scheduledDate: "2026-11-25",
      cost: 8400,
      replacedParts: "Seal kit"
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: created ? [createdOrder] : [] });
      if (path === "/api/work-orders" && method === "POST") {
        created = true;
        return response({ workOrder: createdOrder }, 201);
      }
      if (path === "/api/machines") return response({ machines: [machine] });
      if (path === "/api/work-orders/providers") return response({ providers: [] });
      if (path === "/api/work-orders/work-order-1") return response({ workOrder: createdOrder });
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("ADMIN")} />);
    fireEvent.click(await screen.findByRole("button", { name: "New work order" }));
    const dialog = screen.getByRole("dialog", { name: "New work order" });
    fireEvent.change(within(dialog).getByLabelText("Machine"), { target: { value: "machine-1" } });
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Cooling pump service" } });
    fireEvent.change(within(dialog).getByLabelText("Planned service date"), { target: { value: "2026-11-25" } });
    fireEvent.change(within(dialog).getByLabelText("Cost (LKR)"), { target: { value: "8400" } });
    fireEvent.change(within(dialog).getByLabelText("Replaced parts"), { target: { value: "Seal kit" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save work order" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input, init]) => new URL(String(input)).pathname === "/api/work-orders" && init?.method === "POST");
      expect(request).toBeDefined();
      expect(JSON.parse(String(request![1]?.body))).toEqual({
        machineId: "machine-1",
        title: "Cooling pump service",
        description: null,
        scheduledDate: "2026-11-25",
        cost: 8400,
        notes: null,
        replacedParts: "Seal kit"
      });
    });
  });

  it("saves a limited provider service-details payload with an actual date-only value", async () => {
    const active = workOrder("IN_PROGRESS", { completedDate: null, cost: null, replacedParts: null, notes: null });
    const updated = workOrder("IN_PROGRESS", { completedDate: "2026-11-20", cost: 15750, replacedParts: "Bearing set", notes: "Alignment checked" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [active] });
      if (path === "/api/work-orders/work-order-1" && method === "GET") return response({ workOrder: active });
      if (path === "/api/work-orders/work-order-1/service-details" && method === "PATCH") return response({ workOrder: updated });
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("SERVICE_PROVIDER")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Service details" }));
    const dialog = screen.getByRole("dialog", { name: "Service details" });
    fireEvent.change(within(dialog).getByLabelText("Actual service date"), { target: { value: "2026-11-20" } });
    fireEvent.change(within(dialog).getByLabelText("Final cost (LKR)"), { target: { value: "15750" } });
    fireEvent.change(within(dialog).getByLabelText("Replaced parts"), { target: { value: "Bearing set" } });
    fireEvent.change(within(dialog).getByLabelText("Service notes"), { target: { value: "Alignment checked" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save service details" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input, init]) => new URL(String(input)).pathname.endsWith("/service-details") && init?.method === "PATCH");
      const payload = JSON.parse(String(request?.[1]?.body));
      expect(payload).toEqual({ completedDate: "2026-11-20", cost: 15750, replacedParts: "Bearing set", notes: "Alignment checked" });
      expect(payload).not.toHaveProperty("machineId");
      expect(payload).not.toHaveProperty("title");
    });
  });

  it("lets the assigned provider add evidence and refreshes the register", async () => {
    const sent = workOrder("SENT_TO_PROVIDER");
    const savedEvidence: ServiceEvidence = {
      id: "evidence-1",
      workOrderId: sent.id,
      type: "SERVICE_REPORT",
      fileName: "service-report.pdf",
      fileUrl: "https://files.example.com/service-report.pdf",
      notes: "Signed report",
      createdAt: "2026-11-20T00:00:00.000Z"
    };
    let evidenceSaved = false;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [sent] });
      if (path === "/api/work-orders/work-order-1" && method === "GET") return response({ workOrder: evidenceSaved ? { ...sent, evidence: [savedEvidence] } : sent });
      if (path === "/api/work-orders/work-order-1/evidence" && method === "POST") {
        evidenceSaved = true;
        return response({ evidence: savedEvidence }, 201);
      }
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("SERVICE_PROVIDER")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add evidence" }));
    fireEvent.change(screen.getByLabelText("File name"), { target: { value: "service-report.pdf" } });
    fireEvent.change(screen.getByLabelText("File URL"), { target: { value: "https://files.example.com/service-report.pdf" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Signed report" } });
    fireEvent.click(screen.getByRole("button", { name: "Save evidence" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => new URL(String(input)).pathname.endsWith("/evidence") && init?.method === "POST")).toBe(true));
    expect(await screen.findByText("service-report.pdf")).toBeInTheDocument();
  });
});
