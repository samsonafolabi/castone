import { useEffect, useState } from "react";
import { apiFetch } from "../config";
import "./UsersPage.css";

interface User {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "staff";
  is_active: boolean;
  created_at: string;
}

export default function UsersPage({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "staff" as "admin" | "staff",
  });

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.full_name || !form.email || !form.password) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user.");
        return;
      }
      setForm({ full_name: "", email: "", password: "", role: "staff" });
      setShowPassword(false);
      setShowForm(false);
      await loadUsers();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: User) {
    setSaving(true);
    try {
      const res = await apiFetch(`/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      if (!res.ok) {
        setError("Failed to update user.");
        return;
      }
      await loadUsers();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="users-screen">
      <header className="users-header">
        <button className="users-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h1 className="users-title">Hotel Setup</h1>
          <p className="users-subtitle">Staff Accounts</p>
        </div>
      </header>

      <button
        className="users-add-toggle"
        onClick={() => setShowForm((s) => !s)}
      >
        {showForm ? "Cancel" : "+ Add staff account"}
      </button>

      {showForm && (
        <div className="users-form">
          <label>
            <span>Full name</span>
            <input
              value={form.full_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_name: e.target.value }))
              }
              placeholder="e.g. John Doe"
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="john@castone.com"
            />
          </label>
          <label className="users-field--password">
            <span>Password</span>
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              placeholder="Min. 6 characters"
            />
            <button
              type="button"
              className="users-eye"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </label>
          <label>
            <span>Role</span>
            <select
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  role: e.target.value as "admin" | "staff",
                }))
              }
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button
            className="users-form__save"
            onClick={handleCreate}
            disabled={
              saving || !form.full_name || !form.email || !form.password
            }
          >
            {saving ? "Creating…" : "Create account"}
          </button>
        </div>
      )}

      {error && <div className="users-error">{error}</div>}

      {loading ? (
        <p className="users-loading">Loading staff…</p>
      ) : (
        <ul className="users-list">
          {users.map((u) => (
            <li
              key={u.id}
              className={`users-item ${!u.is_active ? "users-item--inactive" : ""}`}
            >
              <div className="users-item__row">
                <div className="users-item__info">
                  <span className="users-item__name">{u.full_name}</span>
                  <span className="users-item__meta">
                    {u.email} · {u.role}
                  </span>
                </div>
                <button
                  className={`users-item__toggle ${u.is_active ? "users-item__toggle--active" : "users-item__toggle--inactive"}`}
                  onClick={() => toggleActive(u)}
                  disabled={saving}
                >
                  {u.is_active ? "Active" : "Inactive"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
