import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkOrderWorkspace } from "../pages/WorkOrderWorkspace";
import type { Machine, Role, User, WorkOrder, WorkOrderStatus } from "../services/api";

const machine: Machine = {
  id: "11111111-1111-4111-8111-111111111111",
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
  operatorId: "22222222-2222-4222-8222-222222222222",
  operator: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z"
};

const provider = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Reliable Engineering",
  email: "provider@example.com",
  role: "SERVICE_PROVIDER" as const,
  isActive: true
};

const organization = {
  id: "primary",
  companyName: "University of Colombo - Faculty of Technology",
  address: "Pitipana, Homagama",
  registrationNumber: "UOC-FOT",
  phone: "+94 11 275 8000",
  email: "technology@cmb.ac.lk",
  createdAt: "2026-11-11T00:00:00.000Z",
  updatedAt: "2026-11-11T00:00:00.000Z"
};

const machinePart = {
  id: "66666666-6666-4666-8666-666666666666",
  machineId: machine.id,
  name: "Drive belt",
  partNumber: "DB-20",
  warrantyStart: "2026-01-01",
  warrantyEnd: "2027-01-01",
  replacementDue: "2026-12-01",
  quantity: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function workOrder(status: WorkOrderStatus, overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    machineId: machine.id,
    machine: {
      id: machine.id,
      assetCode: machine.assetCode,
      name: machine.name,
      category: machine.category,
      location: machine.location,
      status: machine.status,
      operatorId: machine.operatorId,
      operator: machine.operator,
      parts: [machinePart]
    },
    providerId: status === "DRAFT" || status === "PENDING_MANAGEMENT_APPROVAL" ? null : provider.id,
    provider: status === "DRAFT" || status === "PENDING_MANAGEMENT_APPROVAL" ? null : provider,
    approvedByOperatorId: null,
    approvedByOperator: null,
    createdById: machine.operatorId,
    createdBy: null,
    sourceAlertId: null,
    sourceAlert: null,
    managementApprovedById: null,
    managementApprovedBy: null,
    managementApprovedAt: null,
    paymentApprovedById: null,
    paymentApprovedBy: null,
    paymentApprovedAt: null,
    paymentReference: null,
    title: "Lathe spindle service",
    description: "Inspect and service the spindle assembly.",
    category: "BREAKDOWN_REPAIR",
    priority: "HIGH",
    status,
    scheduledDate: "2026-11-18",
    providerAcceptedAt: null,
    completionSubmittedAt: null,
    completedDate: null,
    proposedBudget: "12500.00",
    serviceCost: "2500.00",
    notes: "Service during the morning shift.",
    replacedParts: null,
    rejectionReason: null,
    replacements: [],
    evidence: [],
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
    ...overrides
  };
}

function currentUser(role: Role): User {
  return {
    id: role === "SERVICE_PROVIDER" ? provider.id : role === "MACHINE_OPERATOR" ? machine.operatorId! : "55555555-5555-4555-8555-555555555555",
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

function baseFetch(record: WorkOrder | null, providers = [provider]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    if (path === "/api/work-orders" && method === "GET") return response({ workOrders: record ? [record] : [] });
    if (path === "/api/machines" && method === "GET") return response({ machines: [machine] });
    if (path === "/api/work-orders/providers" && method === "GET") return response({ providers });
    if (path === "/api/organization-profile" && method === "GET") return response({ profile: organization });
    if (path === `/api/work-orders/${record?.id}` && method === "GET" && record) return response({ workOrder: record });
    if (path === `/api/machines/${machine.id}` && method === "GET") return response({ machine });
    if (path === `/api/machines/${machine.id}/parts` && method === "GET") return response({ parts: [] });
    if (path === `/api/machines/${machine.id}/plans` && method === "GET") return response({ plans: [] });
    return response({ message: "Not found" }, 404);
  });
}

describe("WorkOrderWorkspace milestone 5.5", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens a categorized service request from an alert and shows machine context", async () => {
    baseFetch(null);
    render(<WorkOrderWorkspace
      user={currentUser("MACHINE_OPERATOR")}
      initialRequest={{
        machineId: machine.id,
        sourceAlertId: "66666666-6666-4666-8666-666666666666",
        title: "Drive belt replacement is due",
        category: "PART_REPLACEMENT"
      }}
    />);

    expect(await screen.findByRole("heading", { name: "Create service request" })).toBeInTheDocument();
    expect(screen.getByLabelText("Request title")).toHaveValue("Drive belt replacement is due");
    expect(screen.getByLabelText("Category")).toHaveValue("PART_REPLACEMENT");
    expect(await screen.findByText("M-001 | Workshop Lathe")).toBeInTheDocument();
    expect(screen.getByText("This request is linked to the selected maintenance alert.")).toBeInTheDocument();
  });

  it("lets management select a provider and approve the pending request", async () => {
    let record = workOrder("PENDING_MANAGEMENT_APPROVAL");
    const fetchMock = baseFetch(record);
    fetchMock.mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [record] });
      if (path === "/api/machines") return response({ machines: [machine] });
      if (path === "/api/work-orders/providers") return response({ providers: [provider] });
      if (path === `/api/work-orders/${record.id}` && method === "GET") return response({ workOrder: record });
      if (path.endsWith("/approve-and-dispatch") && method === "POST") {
        const body = JSON.parse(String(init?.body));
        record = workOrder("SENT_TO_PROVIDER", { proposedBudget: body.proposedBudget });
        return response({ workOrder: record });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("MANAGER")} />);
    fireEvent.change(await screen.findByLabelText("Assigned provider"), { target: { value: provider.id } });
    fireEvent.change(screen.getByLabelText("Proposed budget (LKR)"), { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve and send" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => {
      return new URL(String(input)).pathname.endsWith("/approve-and-dispatch") && init?.method === "POST";
    })).toBe(true));
    const dispatchRequest = fetchMock.mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith("/approve-and-dispatch"));
    expect(JSON.parse(String(dispatchRequest?.[1]?.body))).toEqual({ providerId: provider.id, proposedBudget: 20000 });
    expect(await screen.findAllByText("Sent to provider")).not.toHaveLength(0);
  });

  it("requires provider acceptance before work can start", async () => {
    let record = workOrder("SENT_TO_PROVIDER");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [record] });
      if (path === `/api/work-orders/${record.id}` && method === "GET") return response({ workOrder: record });
      if (path === "/api/organization-profile") return response({ profile: organization });
      if (path.endsWith("/accept") && method === "POST") {
        record = workOrder("PROVIDER_ACCEPTED", { providerAcceptedAt: "2026-11-10T10:00:00.000Z" });
        return response({ workOrder: record });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("SERVICE_PROVIDER")} />);
    expect(await screen.findByRole("button", { name: "Accept request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start work" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept request" }));
    expect(await screen.findByRole("button", { name: "Start work" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => {
      return new URL(String(input)).pathname === `/api/machines/${machine.id}/parts`;
    })).toBe(false);
  });

  it("lets the assigned provider save receipt identity without protected asset calls", async () => {
    let record = workOrder("IN_PROGRESS");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [record] });
      if (path === `/api/work-orders/${record.id}` && method === "GET") return response({ workOrder: record });
      if (path === "/api/organization-profile") return response({ profile: organization });
      if (path.endsWith("/service-details") && method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        record = workOrder("IN_PROGRESS", body);
        return response({ workOrder: record });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("SERVICE_PROVIDER")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
    fireEvent.change(screen.getByLabelText("Service / labour charge (LKR)"), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText("Provider business name"), { target: { value: "Reliable Engineering (Pvt) Ltd" } });
    fireEvent.change(screen.getByLabelText("Provider registration number"), { target: { value: "PV-102030" } });
    fireEvent.change(screen.getByLabelText("Provider address"), { target: { value: "45 Industrial Road, Colombo" } });
    fireEvent.change(screen.getByLabelText("Provider contact"), { target: { value: "+94 11 555 0199" } });
    fireEvent.change(screen.getByLabelText("Invoice / receipt number"), { target: { value: "INV-2026-041" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input, init]) => {
        return new URL(String(input)).pathname.endsWith("/service-details") && init?.method === "PATCH";
      });
      expect(JSON.parse(String(request?.[1]?.body))).toEqual(expect.objectContaining({
        providerBusinessName: "Reliable Engineering (Pvt) Ltd",
        serviceCost: 3000,
        providerRegistrationNumber: "PV-102030",
        providerAddress: "45 Industrial Road, Colombo",
        providerContact: "+94 11 555 0199",
        invoiceNumber: "INV-2026-041"
      }));
    });
    expect(await screen.findAllByText("INV-2026-041")).not.toHaveLength(0);
    expect(fetchMock.mock.calls.some(([input]) => {
      return new URL(String(input)).pathname === `/api/machines/${machine.id}/parts`;
    })).toBe(false);
  });

  it("lets management approve payment and close a completed service", async () => {
    let record = workOrder("AWAITING_PAYMENT_APPROVAL", {
      proposedBudget: "12000.00",
      serviceCost: "3000.00",
      completedDate: "2026-11-19",
      completionSubmittedAt: "2026-11-19T10:00:00.000Z",
      replacements: [{
        id: "replacement-1",
        workOrderId: "44444444-4444-4444-8444-444444444444",
        machinePartId: machinePart.id,
        partName: "Drive belt",
        partNumber: "DB-20",
        quantity: 2,
        unitCost: "5000.00",
        warrantyStart: "2026-11-19",
        warrantyEnd: "2027-11-19",
        nextReplacementDate: "2027-10-19",
        notes: null,
        createdAt: "2026-11-19T10:00:00.000Z",
        updatedAt: "2026-11-19T10:00:00.000Z"
      }]
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [record] });
      if (path === "/api/machines") return response({ machines: [machine] });
      if (path === "/api/work-orders/providers") return response({ providers: [provider] });
      if (path === `/api/work-orders/${record.id}` && method === "GET") return response({ workOrder: record });
      if (path.endsWith("/approve-payment") && method === "POST") {
        record = workOrder("CLOSED", {
          completedDate: "2026-11-19",
          paymentReference: "PAY-2026-001",
          paymentApprovedBy: currentUser("OWNER"),
          paymentApprovedById: currentUser("OWNER").id,
          paymentApprovedAt: "2026-11-20T10:00:00.000Z"
        });
        return response({ workOrder: record });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("OWNER")} />);
    expect((await screen.findAllByText("LKR 13,000.00")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("LKR 1,000.00 over budget")).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Payment reference"), { target: { value: "PAY-2026-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve payment and close" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith("/approve-payment"));
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({ paymentReference: "PAY-2026-001" });
    });
    expect(await screen.findAllByText("Closed")).not.toHaveLength(0);
  });

  it("lets an owner or manager counter the receipt with a revised budget and message", async () => {
    let record = workOrder("AWAITING_PAYMENT_APPROVAL", {
      proposedBudget: "12000.00",
      serviceCost: "15000.00"
    });
    const fetchMock = baseFetch(record);
    fetchMock.mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [record] });
      if (path === "/api/machines") return response({ machines: [machine] });
      if (path === "/api/work-orders/providers") return response({ providers: [provider] });
      if (path === "/api/organization-profile") return response({ profile: organization });
      if (path === `/api/work-orders/${record.id}` && method === "GET") return response({ workOrder: record });
      if (path.endsWith("/counter-payment") && method === "POST") {
        const body = JSON.parse(String(init?.body));
        record = workOrder("PRICE_REVISION_REQUESTED", {
          proposedBudget: body.counterBudget,
          serviceCost: "15000.00",
          priceCounterOffers: [{
            id: "counter-1",
            workOrderId: record.id,
            createdById: currentUser("MANAGER").id,
            createdBy: currentUser("MANAGER"),
            counterBudget: body.counterBudget,
            reviewedTotal: 15000,
            reason: body.reason,
            respondedAt: null,
            createdAt: "2026-11-20T10:00:00.000Z"
          }]
        });
        return response({ workOrder: record });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("MANAGER")} />);
    fireEvent.change(await screen.findByLabelText("Counter budget (LKR)"), { target: { value: "13500" } });
    fireEvent.change(screen.getByLabelText("Reason / message"), { target: { value: "Please review the labour and belt prices." } });
    fireEvent.click(screen.getByRole("button", { name: "Counter and request revision" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith("/counter-payment"));
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({
        counterBudget: 13500,
        reason: "Please review the labour and belt prices."
      });
    });
    expect(await screen.findByText("Please review the labour and belt prices.")).toBeInTheDocument();
    expect((await screen.findAllByText("Price revision requested")).length).toBeGreaterThan(0);
  });

  it("lets the provider revise a part price and resubmit after a counteroffer", async () => {
    const replacement = {
      id: "replacement-1",
      workOrderId: "44444444-4444-4444-8444-444444444444",
      machinePartId: machinePart.id,
      partName: "Drive belt",
      partNumber: "DB-20",
      quantity: 1,
      unitCost: "5000.00",
      warrantyStart: "2026-11-19",
      warrantyEnd: "2027-11-19",
      nextReplacementDate: "2027-10-19",
      notes: null,
      createdAt: "2026-11-19T10:00:00.000Z",
      updatedAt: "2026-11-19T10:00:00.000Z"
    };
    let record = workOrder("PRICE_REVISION_REQUESTED", {
      proposedBudget: "13500.00",
      serviceCost: "9000.00",
      replacements: [replacement],
      priceCounterOffers: [{
        id: "counter-1",
        workOrderId: "44444444-4444-4444-8444-444444444444",
        createdById: currentUser("OWNER").id,
        createdBy: currentUser("OWNER"),
        counterBudget: "13500.00",
        reviewedTotal: "15000.00",
        reason: "Please review the drive belt unit price.",
        respondedAt: null,
        createdAt: "2026-11-20T10:00:00.000Z"
      }]
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/work-orders" && method === "GET") return response({ workOrders: [record] });
      if (path === `/api/work-orders/${record.id}` && method === "GET") return response({ workOrder: record });
      if (path === "/api/organization-profile") return response({ profile: organization });
      if (path.endsWith(`/replacements/${replacement.id}`) && method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        replacement.unitCost = String(body.unitCost);
        record = { ...record, replacements: [{ ...replacement }] };
        return response({ replacement });
      }
      if (path.endsWith("/submit-completion") && method === "POST") {
        record = { ...record, status: "AWAITING_PAYMENT_APPROVAL" };
        return response({ workOrder: record });
      }
      return response({ message: "Not found" }, 404);
    });

    render(<WorkOrderWorkspace user={currentUser("SERVICE_PROVIDER")} />);
    expect(await screen.findByText("Please review the drive belt unit price.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Drive belt" }));
    fireEvent.change(screen.getByLabelText("Unit cost (LKR)"), { target: { value: "4500" } });
    fireEvent.click(screen.getByRole("button", { name: "Update replacement" }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input, init]) => new URL(String(input)).pathname.endsWith(`/replacements/${replacement.id}`) && init?.method === "PATCH");
      expect(JSON.parse(String(request?.[1]?.body))).toEqual(expect.objectContaining({ unitCost: 4500 }));
    });
    fireEvent.click(await screen.findByRole("button", { name: "Resubmit revised receipt" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname.endsWith("/submit-completion"))).toBe(true));
  });
});
