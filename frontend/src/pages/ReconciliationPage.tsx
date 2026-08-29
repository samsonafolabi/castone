import { useEffect, useState } from "react";
import "./ReconciliationPage.css";
import { apiFetch } from "../config";

interface Product {
  id: string;
  name: string;
  category?: string;
}

interface CountResult {
  id: string;
  product_id: string;
  product_name: string;
  system_closing_stock: number;
  physical_count: number;
  discrepancy: number;
  status: "ok" | "flagged";
  admin_note?: string;
}

interface CloseRecord {
  id: string;
  count_date: string;
  period_start: string;
  period_end: string;
  total_revenue: number;
  closed_at: string;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReconciliationPage({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<"count" | "review">("count");
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [countDate, setCountDate] = useState(todayStr());
  const [results, setResults] = useState<CountResult[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null);
  const [lastClose, setLastClose] = useState<CloseRecord | null>(null);

  useEffect(() => {
    loadProducts();
    loadCloseHistory();
  }, []);

  async function loadProducts() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/products");
      const data = await res.json();
      setProducts(data);
    } catch {
      setError("Could not load products.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCloseHistory() {
    try {
      const res = await apiFetch("/monthly-closes");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setLastClose(data[0]);
      }
    } catch {
      // non-critical — fail silently, banner just won't show
    }
  }

  async function handleSubmitCount() {
    const entries = products
      .filter((p) => counts[p.id] !== undefined && counts[p.id] !== "")
      .map((p) => ({ product_id: p.id, physical_count: Number(counts[p.id]) }));

    if (entries.length !== products.length) {
      setError("Enter a count for every product before submitting.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/monthly-stock-counts", {
        method: "POST",
        body: JSON.stringify({ count_date: countDate, counts: entries }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit count.");
        return;
      }
      await loadReview();
      setStep("review");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadReview() {
    try {
      const res = await apiFetch(
        `/monthly-stock-counts?count_date=${countDate}`,
      );
      const data = await res.json();
      setResults(data);
    } catch {
      setError("Could not load review.");
    }
  }

  async function handleSaveNote(id: string) {
    const note = noteDrafts[id];
    try {
      await apiFetch(`/monthly-stock-counts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ admin_note: note }),
      });
      await loadReview();
    } catch {
      setError("Could not save note.");
    }
  }

  async function handleClose() {
    setClosing(true);
    setError("");
    try {
      const res = await apiFetch("/monthly-closes", {
        method: "POST",
        body: JSON.stringify({ count_date: countDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to close period.");
        return;
      }
      setCloseSuccess(
        `Period closed. Total revenue: ₦${Number(data.total_revenue).toLocaleString()}`,
      );
      await loadCloseHistory();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setClosing(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const flaggedCount = results.filter((r) => r.status === "flagged").length;

  return (
    <div className="recon-screen">
      <header className="recon-header">
        <button className="recon-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h1 className="recon-title">Monthly Reconciliation</h1>
          <p className="recon-subtitle">
            {step === "count" ? "Physical stock count" : "Review & close"}
          </p>
        </div>
      </header>

      {lastClose && (
        <div className="recon-last-close">
          Last closed: {formatDate(lastClose.count_date)} · ₦
          {lastClose.total_revenue.toLocaleString()} revenue
        </div>
      )}

      {error && <div className="recon-error">{error}</div>}

      {step === "count" && (
        <>
          <label className="recon-date-label">
            <span>Count date</span>
            <input
              type="date"
              value={countDate}
              min={lastClose ? lastClose.count_date : undefined}
              max={todayStr()}
              onChange={(e) => setCountDate(e.target.value)}
              className="recon-date-input"
            />
          </label>

          <div className="recon-hint">
            Enter what's physically on the shelf for each product. This is blind
            — system figures are hidden until after you submit.
          </div>

          {loading ? (
            <p className="recon-loading">Loading products…</p>
          ) : (
            <ul className="recon-list">
              {products.map((p) => (
                <li key={p.id} className="recon-count-item">
                  <span className="recon-count-item__name">{p.name}</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className="recon-count-item__input"
                    value={counts[p.id] ?? ""}
                    onChange={(e) =>
                      setCounts((c) => ({ ...c, [p.id]: e.target.value }))
                    }
                    placeholder="0"
                  />
                </li>
              ))}
            </ul>
          )}

          <button
            className="recon-submit"
            onClick={handleSubmitCount}
            disabled={submitting || loading}
          >
            {submitting ? "Submitting…" : "Submit count"}
          </button>
        </>
      )}

      {step === "review" && (
        <>
          <div
            className={`recon-summary ${flaggedCount > 0 ? "recon-summary--flagged" : "recon-summary--ok"}`}
          >
            {flaggedCount === 0
              ? "All products match — no discrepancies."
              : `${flaggedCount} product${flaggedCount > 1 ? "s" : ""} flagged for review.`}
          </div>

          <ul className="recon-list">
            {results.map((r) => (
              <li
                key={r.id}
                className={`recon-review-item ${r.status === "flagged" ? "recon-review-item--flagged" : ""}`}
              >
                <div className="recon-review-item__row">
                  <span className="recon-review-item__name">
                    {r.product_name}
                  </span>
                  <span
                    className={`recon-review-item__badge ${r.status === "flagged" ? "recon-review-item__badge--flagged" : ""}`}
                  >
                    {r.status === "flagged"
                      ? `${r.discrepancy > 0 ? "+" : ""}${r.discrepancy}`
                      : "OK"}
                  </span>
                </div>
                <div className="recon-review-item__detail">
                  Expected {r.system_closing_stock} · Counted {r.physical_count}
                </div>

                {r.status === "flagged" && (
                  <div className="recon-note">
                    <input
                      type="text"
                      placeholder="Add a note (e.g. breakage, miscount)"
                      value={noteDrafts[r.id] ?? r.admin_note ?? ""}
                      onChange={(e) =>
                        setNoteDrafts((d) => ({ ...d, [r.id]: e.target.value }))
                      }
                    />
                    <button onClick={() => handleSaveNote(r.id)}>Save</button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {closeSuccess ? (
            <div className="recon-close-success">{closeSuccess}</div>
          ) : (
            <button
              className="recon-close"
              onClick={handleClose}
              disabled={closing}
            >
              {closing ? "Closing…" : "Close this period"}
            </button>
          )}

          <button
            className="recon-back-to-count"
            onClick={() => setStep("count")}
          >
            ← Back to count entry
          </button>
        </>
      )}
    </div>
  );
}
