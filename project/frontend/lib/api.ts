import { getToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = normalizeDetail(body.detail) ?? detail;
    } catch {
      // ignore JSON parse errors on error bodies
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}


/**
 * FastAPI reports errors in three different shapes: a plain string for the
 * HTTPException we raise ourselves, and an array of objects for Pydantic
 * validation failures. Rendering the array straight into JSX is what produced
 * "[object Object]" on screen instead of the real reason.
 */
function normalizeDetail(detail: unknown): string | null {
  if (!detail) return null;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          const msg = typeof record.msg === "string" ? record.msg : null;
          const loc = Array.isArray(record.loc)
            ? record.loc.filter((part) => part !== "body").join(".")
            : null;
          if (msg) return loc ? `${loc}: ${msg}` : msg;
        }
        return null;
      })
      .filter((m): m is string => !!m);
    return messages.length ? messages.join(" · ") : null;
  }

  if (typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.msg === "string") return record.msg;
  }
  return null;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, auth),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { API_URL };
