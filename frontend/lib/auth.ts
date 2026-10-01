export type Farmer = { farmer_id: number; name: string; email: string; phone: string | null };
export type DemoSession = Farmer;
const SESSION_KEY = "smart-irrigation-farmer-session";
function apiBase(): string { return ""; }
export function getSession(): Farmer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Farmer;
    return Number.isInteger(value.farmer_id) && value.email ? value : null;
  } catch { window.localStorage.removeItem(SESSION_KEY); return null; }
}
export function saveSession(farmer: Farmer): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(farmer));
  window.dispatchEvent(new Event("irrigation-session-change"));
}
export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("irrigation-session-change"));
}
export async function validateSession(): Promise<Farmer | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/auth/me`, { credentials: "include", cache: "no-store", signal: controller.signal });
  } catch {
    // Network error or timeout — trust localStorage cache
    window.clearTimeout(timeout);
    return getSession();
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.ok) {
    const data = await response.json() as { farmer: Farmer };
    saveSession(data.farmer);
    return data.farmer;
  }
  if (response.status === 401) {
    // The API explicitly rejected the cookie, so a cached farmer is stale.
    clearSession();
    return null;
  }
  // For temporary backend errors, keep the cached session available.
  return getSession();
}
export async function logout(): Promise<void> {
  const base = apiBase();
  try { await fetch(`${base}/api/auth/logout`, { method: "POST", credentials: "include" }); } finally { clearSession(); }
}
