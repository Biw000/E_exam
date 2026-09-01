const TOKEN_KEY = "eexam_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/**
 * Reads the role claim out of the JWT payload for client-side UI routing
 * only (e.g. deciding whether to show the admin nav link). The backend is
 * the source of truth and re-validates the token + role on every request,
 * so this decode is purely cosmetic and never trusted for authorization.
 */
export function getRoleFromToken(): "admin" | "student" | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}
