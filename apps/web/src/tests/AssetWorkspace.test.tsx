import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetWorkspace } from "../pages/AssetWorkspace";
import type { Machine, MachinePart, MaintenancePlan, Role, User } from "../services/api";

const operator = {
  id: "operator-1",
  name: "Nimal Operator",
  email: "operator@example.com",
  role: "MACHINE_OPERATOR" as const,
  isActive: true
};

const machineA: Machine = {
  id: "machine-a",
  assetCode: "M-001",
  name: "Workshop Lathe",
  category: "Machining",
  location: "Main Workshop",
  manufacturer: "Acme",
  model: "LT-20",
  serialNumber: "SN-100",
  warrantyStart: "2026-01-01T00:00:00.000Z",
  warrantyEnd: "2027-01-01T00:00:00.000Z",
  status: "ACTIVE",
  operatorId: operator.id,
  operator,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const machineB: Machine = {
  ...machineA,
  id: "machine-b",
  assetCode: "M-002",
  name: "Milling Machine",
  location: "Automation Lab",
  operatorId: null,
  operator: null
};

const part: MachinePart = {
  id: "part-1",
  machineId: machineA.id,
  name: "Drive belt",
  partNumber: "BELT-01",
  warrantyStart: null,
  warrantyEnd: "2027-04-01T00:00:00.000Z",
  replacementDue: "2027-03-01T00:00:00.000Z",
  quantity: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const plan: MaintenancePlan = {
  id: "plan-1",
  machineId: machineA.id,
  title: "Monthly lubrication",
  description: "Lubricate moving assemblies.",
  frequency: "MONTHLY",
  intervalDays: null,
  nextDueDate: "2026-12-15T00:00:00.000Z",
  thresholdDays: 7,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}

function mockAssetApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, "");
    const method = init?.method ?? "GET";

    if (path === "/machines" && method === "GET") return response({ machines: [machineA, machineB] });
    if (path === "/operators" && method === "GET") return response({ operators: [operator] });
    if (path === "/machines/machine-a" && method === "GET") return response({ machine: machineA });
    if (path === "/machines/machine-b" && method === "GET") return response({ machine: machineB });
    if (path === "/machines/machine-a/parts" && method === "GET") return response({ parts: [part] });
    if (path === "/machines/machine-b/parts" && method === "GET") return response({ parts: [] });
    if (path === "/machines/machine-a/plans" && method === "GET") return response({ plans: [plan] });
    if (path === "/machines/machine-b/plans" && method === "GET") return response({ plans: [] });
    if (path === "/machines" && method === "POST") {
      const inputBody = JSON.parse(String(init?.body)) as Partial<Machine>;
      return response({ machine: { ...machineB, ...inputBody, id: "machine-c" } }, 201);
    }
    return response({ message: `Unhandled ${method} ${path}` }, 404);
  });
}

function currentUser(role: Role): User {
  return {
    id: `${role.toLowerCase()}-1`,
    name: `${role} User`,
    email: `${role.toLowerCase()}@example.com`,
    role,
    isActive: true
  };
}

async function renderFor(role: Role) {
  const fetchMock = mockAssetApi();
  render(<AssetWorkspace user={currentUser(role)} />);
  expect(await screen.findByRole("heading", { name: "Workshop Lathe" })).toBeInTheDocument();
  return fetchMock;
}

describe("AssetWorkspace", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not render or request asset data for service providers", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { container } = render(<AssetWorkspace user={currentUser("SERVICE_PROVIDER")} />);

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives administrators full machine and nested record controls", async () => {
    const fetchMock = await renderFor("ADMIN");

    expect(screen.getByRole("button", { name: "Add machine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit machine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete machine M-001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add part" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit part Drive belt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete part Drive belt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete plan Monthly lubrication" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname === "/api/machines/machine-a/plans")).toBe(true);
  });

  it("gives owners create and update controls without destructive controls", async () => {
    await renderFor("OWNER");

    expect(screen.getByRole("button", { name: "Add machine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit machine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit part Drive belt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete machine/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete part/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete plan/ })).not.toBeInTheDocument();
  });

  it("gives managers nested delete controls but not machine delete", async () => {
    await renderFor("MANAGER");

    expect(screen.getByRole("button", { name: "Edit machine" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete machine/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete part Drive belt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete plan Monthly lubrication" })).toBeInTheDocument();
  });

  it("keeps operator asset records read-only while allowing assigned maintenance plans", async () => {
    const fetchMock = await renderFor("MACHINE_OPERATOR");

    expect(screen.getByText(/Manage maintenance plans for assigned machines/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add machine" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit machine" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add part" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit plan Monthly lubrication" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/operators"))).toBe(false);
  });

  it("submits a normalized machine creation payload", async () => {
    const fetchMock = await renderFor("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: "Add machine" }));

    fireEvent.change(screen.getByLabelText("Asset code"), { target: { value: " m-003 " } });
    fireEvent.change(screen.getByLabelText("Machine name"), { target: { value: "CNC Router" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Fabrication" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Digital Lab" } });
    fireEvent.change(screen.getByLabelText("Warranty start"), { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByLabelText("Warranty end"), { target: { value: "2027-11-09" } });
    fireEvent.change(screen.getByLabelText("Assigned operator"), { target: { value: operator.id } });
    fireEvent.click(screen.getByRole("button", { name: "Save record" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      assetCode: "M-003",
      name: "CNC Router",
      location: "Digital Lab",
      warrantyStart: "2026-11-09",
      warrantyEnd: "2027-11-09",
      operatorId: operator.id
    });
  });

  it("closes the machine editor when selection changes", async () => {
    const fetchMock = await renderFor("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: "Edit machine" }));
    expect(screen.getByRole("dialog", { name: "Edit machine" })).toBeInTheDocument();
    expect(screen.getByLabelText("Machine name")).toHaveValue("Workshop Lathe");

    fireEvent.click(screen.getByText("M-002").closest("button")!);

    expect(await screen.findByRole("heading", { name: "Milling Machine" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
});
