export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`);

  if (!response.ok) {
    throw new Error(`API health check failed with status ${response.status}`);
  }

  return response.json() as Promise<HealthResponse>;
}
