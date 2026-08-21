import { useState, type FormEvent } from "react";
import CastoneLogo from "../assets/CastoneLogo.svg";
import "./LoginPage.css";

interface LoginPageProps {
  onLoginSuccess: (user: any, token: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:4000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Unable to sign in. Check your details.");
        return;
      }

      localStorage.setItem("token", data.token);
      onLoginSuccess(data.user, data.token);
    } catch {
      setError("Cannot reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__stripe" />
        <div className="login-card__body">
          <img
            src={CastoneLogo}
            alt="Castone Royal Hotel & Suites"
            className="login-logo"
          />
          <h1 className="login-title">Castone Royal</h1>
          <p className="login-subtitle">Hotel &amp; Suites — Staff sign in</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@castone.com"
                required
                autoComplete="username"
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </label>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
