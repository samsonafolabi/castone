export const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    credentials: "include", // sends/receives the httpOnly cookie automatically
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}
