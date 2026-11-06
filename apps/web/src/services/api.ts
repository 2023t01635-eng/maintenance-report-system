export type Role = "ADMIN" | "OWNER" | "MANAGER" | "MACHINE_OPERATOR" | "SERVICE_PROVIDER";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardSummary = {
  role: Role;
  totals: {
    machines: number;
    openAlerts: number;
    activeWorkOrders: number;
    activeUsers: number;
  };
};

export type UserInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function getSetupStatus() {
  return apiRequest<{ needsSetup: boolean }>("/auth/setup-status");
}

export function setupAdmin(input: Omit<UserInput, "role">) {
  return apiRequest<{ user: User }>("/auth/setup-admin", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function login(email: string, password: string) {
  return apiRequest<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function getCurrentUser() {
  return apiRequest<{ user: User }>("/auth/me");
}

export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function getDashboardSummary() {
  return apiRequest<DashboardSummary>("/dashboard/summary");
}

export function getUsers() {
  return apiRequest<{ users: User[] }>("/users");
}

export function createUser(input: UserInput) {
  return apiRequest<{ user: User }>("/users", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateUser(id: string, input: Partial<UserInput & Pick<User, "isActive">>) {
  return apiRequest<{ user: User }>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}
