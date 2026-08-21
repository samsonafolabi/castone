import { useEffect, useState } from "react";
import "./StockEntryPage.css";

const API = "http://localhost:4000";

interface Product {
  id: string;
  name: string;
  category?: string;
  unit_price: number;
  current_stock: number;
}

interface Entry {
  product_id: string;
  sales_qty: number;
  purchases: number;
  closing_stock: number;
  amount: number;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d); // local date, no timezone involved
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function StockEntryPage({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { sales_qty: string; purchases: string }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dayTotal, setDayTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const isToday = selectedDate === todayStr();
  const isFuture = selectedDate > todayStr();

  const token = localStorage.getItem("token");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    loadData(selectedDate);
    setOpenId(null);
  }, [selectedDate]);

  async function loadData(date: string) {
    setLoading(true);
    setError("");
    try {
      const [productsRes, entriesRes] = await Promise.all([
        fetch(`${API}/products`, { headers }),
        fetch(`${API}/stock-entries?date=${date}`, { headers }),
      ]);
      const productsData = await productsRes.json();
      const entriesData = await entriesRes.json();

      setProducts(productsData);

      const entryMap: Record<string, Entry> = {};
      (entriesData.entries ?? []).forEach((e: Entry) => {
        entryMap[e.product_id] = e;
      });
      setEntries(entryMap);
      setDayTotal(entriesData.day_total ?? null);
    } catch {
      setError("Could not load products or entries.");
    } finally {
      setLoading(false);
    }
  }

  function openProduct(id: string) {
    if (!isToday) return; // read-only for past/future dates
    if (openId === id) {
      setOpenId(null);
      return;
    }
    const existing = entries[id];
    setDrafts((d) => ({
      ...d,
      [id]: {
        sales_qty: existing ? String(existing.sales_qty) : "",
        purchases: existing ? String(existing.purchases) : "0",
      },
    }));
    setOpenId(id);
  }

  async function handleSave(productId: string) {
    const draft = drafts[productId];
    if (!draft || draft.sales_qty === "") return;

    setSavingId(productId);
    setError("");
    try {
      const res = await fetch(`${API}/stock-entries`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          product_id: productId,
          sales_qty: Number(draft.sales_qty),
          purchases: Number(draft.purchases || 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save entry.");
        return;
      }
      await loadData(selectedDate);
      setOpenId(null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="stock-screen">
      <header className="stock-header">
        <button className="stock-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h1 className="stock-title">Stock Entries</h1>
          <p className="stock-subtitle">
            {isToday ? "Today" : formatDisplayDate(selectedDate)} ·{" "}
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </header>

      <div className="stock-date-nav">
        <button
          className="stock-date-nav__btn"
          onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
          aria-label="Previous day"
        >
          ←
        </button>
        <input
          type="date"
          className="stock-date-nav__input"
          value={selectedDate}
          max={todayStr()}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        <button
          className="stock-date-nav__btn"
          onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
          disabled={isToday}
          aria-label="Next day"
        >
          →
        </button>
        {!isToday && (
          <button
            className="stock-date-nav__today"
            onClick={() => setSelectedDate(todayStr())}
          >
            Today
          </button>
        )}
      </div>

      {!isToday && !isFuture && (
        <div className="stock-readonly-banner">
          Viewing past entries — read only. Only today's entries can be edited.
        </div>
      )}

      {dayTotal !== null && (
        <div className="stock-total-card">
          <span className="stock-total-label">
            {isToday ? "Day total" : "Total for this day"}
          </span>
          <span className="stock-total-value">
            ₦{dayTotal.toLocaleString()}
          </span>
        </div>
      )}

      {error && <div className="stock-error">{error}</div>}

      {loading ? (
        <p className="stock-loading">Loading…</p>
      ) : (
        <ul className="stock-list">
          {products.map((p) => {
            const entry = entries[p.id];
            const isOpen = openId === p.id;
            const draft = drafts[p.id] ?? { sales_qty: "", purchases: "0" };

            return (
              <li
                key={p.id}
                className={`stock-item ${isOpen ? "stock-item--open" : ""}`}
              >
                <button
                  className={`stock-item__row ${!isToday ? "stock-item__row--readonly" : ""}`}
                  onClick={() => openProduct(p.id)}
                >
                  <span className="stock-item__name">
                    {p.name}
                    {isToday && (
                      <span className="stock-item__stock">
                        · {p.current_stock} in stock
                      </span>
                    )}
                  </span>
                  {entry ? (
                    <span className="stock-item__status stock-item__status--done">
                      {entry.sales_qty} sold
                      {entry.purchases > 0 && ` · ${entry.purchases} supplied`}
                      {` · ₦${entry.amount.toLocaleString()}`}
                    </span>
                  ) : (
                    <span className="stock-item__status">Not entered</span>
                  )}
                </button>

                {isOpen && isToday && (
                  <div className="stock-item__form">
                    <p className="stock-item__stock-hint">
                      Currently {p.current_stock} in stock
                    </p>
                    <label>
                      <span>Sales qty</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={draft.sales_qty}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [p.id]: { ...draft, sales_qty: e.target.value },
                          }))
                        }
                        placeholder="0"
                        autoFocus
                      />
                    </label>
                    <label>
                      <span>Supply (if any)</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={draft.purchases}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [p.id]: { ...draft, purchases: e.target.value },
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                    <button
                      className="stock-item__save"
                      onClick={() => handleSave(p.id)}
                      disabled={savingId === p.id || draft.sales_qty === ""}
                    >
                      {savingId === p.id ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
