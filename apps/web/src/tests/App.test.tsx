import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const admin = {
  id: "admin-1",
  name: "System Administrator",
  email: "admin@example.com",
  role: "ADMIN",
  isActive: true
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
  });

  it("does not expose the asset workspace to service providers", async () => {
    const provider = { ...admin, id: "provider-1", name: "Service Provider", role: "SERVICE_PROVIDER" };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/auth/setup-status")) return response({ needsSetup: false });
      if (url.endsWith("/auth/me")) return response({ user: provider });
      if (url.endsWith("/dashboard/summary")) return response({ role: "SERVICE_PROVIDER", totals: { machines: 0, openAlerts: 0, activeWorkOrders: 2, activeUsers: 0 } });
      return response({ message: "Not found" }, 404);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /Maintenance overview/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alerts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work Orders" })).toBeInTheDocument();
  });
});
