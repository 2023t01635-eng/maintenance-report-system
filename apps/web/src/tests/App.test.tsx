import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const admin = {
  id: "admin-1",
  name: "System Administrator",
  email: "admin@example.com",
  role: "ADMIN",
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

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}

describe("App", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows first-time administrator setup when no users exist", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ needsSetup: true }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: /Create administrator/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
  });

  it("renders the authenticated administrator dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/auth/setup-status")) return response({ needsSetup: false });
      if (url.endsWith("/auth/me")) return response({ user: admin });
      if (url.endsWith("/dashboard/summary")) return response({ role: "ADMIN", totals: { machines: 3, openAlerts: 2, activeWorkOrders: 1, activeUsers: 4 } });
      if (url.endsWith("/dashboard/activity")) return response({ events: [] });
      if (url.endsWith("/organization-profile")) return response({ profile: organization });
      if (url.endsWith("/users")) return response({ users: [admin] });
      return response({ message: "Not found" }, 404);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /Maintenance overview/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /User management/i })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alerts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work Orders" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Payments" })).toBeInTheDocument();
  });

  it("does not expose the asset workspace to service providers", async () => {
    const provider = { ...admin, id: "provider-1", name: "Service Provider", role: "SERVICE_PROVIDER" };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/auth/setup-status")) return response({ needsSetup: false });
      if (url.endsWith("/auth/me")) return response({ user: provider });
      if (url.endsWith("/dashboard/summary")) return response({ role: "SERVICE_PROVIDER", totals: { machines: 0, openAlerts: 0, activeWorkOrders: 2, activeUsers: 0 } });
      if (url.endsWith("/dashboard/activity")) return response({ events: [{
        id: "activity-1",
        action: "WORK_ORDER_COMPLETION_SUBMITTED",
        entityType: "WorkOrder",
        entityId: "work-order-1",
        details: null,
        createdAt: "2026-11-11T09:30:00.000Z",
        actor: { id: "provider-1", name: "Service Provider", role: "SERVICE_PROVIDER" }
      }] });
      if (url.endsWith("/dashboard/payments")) return response({
        role: "SERVICE_PROVIDER",
        direction: "INFLOW",
        summary: { paymentTotal: 41000, budgetTotal: 40500, overBudgetAmount: 2000, underBudgetAmount: 1500, netVariance: 500, paymentCount: 2 },
        monthly: [{ month: "2026-11", paymentTotal: 41000, budgetTotal: 40500, count: 2 }],
        payments: [{
          id: "work-order-1",
          title: "Lathe service",
          direction: "INFLOW",
          machine: { id: "machine-1", assetCode: "LAB-001", name: "Lathe" },
          provider: { id: "provider-1", name: "Service Provider", email: "provider@example.com" },
          approvedBy: { id: "manager-1", name: "Workshop Manager", role: "MANAGER" },
          paymentApprovedAt: "2026-11-12T00:00:00.000Z",
          completedDate: "2026-11-10T00:00:00.000Z",
          paymentReference: "PAY-001",
          proposedBudget: 20000,
          serviceCost: 9000,
          partsTotal: 9500,
          paymentValue: 18500,
          variance: -1500,
          parts: [{ id: "part-1", partName: "Drive belt", partNumber: "DB-20", quantity: 1, unitCost: 9500, lineTotal: 9500 }]
        }, {
          id: "work-order-2",
          title: "Compressor service",
          direction: "INFLOW",
          machine: { id: "machine-2", assetCode: "LAB-002", name: "Compressor" },
          provider: { id: "provider-1", name: "Service Provider", email: "provider@example.com" },
          approvedBy: { id: "owner-1", name: "Faculty Owner", role: "OWNER" },
          paymentApprovedAt: "2026-11-12T00:00:00.000Z",
          completedDate: "2026-11-11T00:00:00.000Z",
          paymentReference: "PAY-002",
          proposedBudget: 20500,
          serviceCost: 12000,
          partsTotal: 10500,
          paymentValue: 22500,
          variance: 2000,
          parts: [{ id: "part-2", partName: "Filter", partNumber: "FL-10", quantity: 1, unitCost: 10500, lineTotal: 10500 }]
        }]
      });
      if (url.endsWith("/organization-profile")) return response({ profile: organization });
      return response({ message: "Not found" }, 404);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /Maintenance overview/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alerts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work Orders" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Payments" })).toBeInTheDocument();
    expect(await screen.findByText("Service Provider submitted service completion")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Payments" }));
    expect(await screen.findByRole("heading", { name: "Payments" })).toBeInTheDocument();
    expect(await screen.findByText("1 x Drive belt")).toBeInTheDocument();
    expect(screen.getByText("Workshop Manager")).toBeInTheDocument();
    expect(screen.getByText(/1,500\.00 under/)).toHaveClass("unfavorable");
    expect(screen.getByText(/2,000\.00 over/)).toHaveClass("favorable");
    expect(screen.getByText("Total above budget").closest("article")).toHaveClass("favorable");
  });
});
