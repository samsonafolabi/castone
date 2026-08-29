import { useEffect, useState } from "react";
import { apiFetch } from "../config";
import "./DashboardPage.css";

interface DailyRevenue {
  date: string;
  revenue: number;
}

interface RevenueData {
  from: string;
  to: string;
  total_revenue: number;
  daily: DailyRevenue[];
  details: {
    date: string;
    product_name: string;
    sales_qty: number;
    unit_price: number;
    amount: number;
  }[];
}

interface FlaggedItem {
  id: string;
  product_name: string;
  system_closing_stock: number;
  physical_count: number;
  discrepancy: number;
  status: "ok" | "flagged";
  admin_note?: string;
}

interface Guest {
  id: string;
  date_of_arrival?: string;
  date_of_departure?: string;
}

type RangePreset = "week" | "7days" | "month" | "lastmonth" | "custom";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  date.setDate(diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfMonth(dateStr: string) {
  return `${dateStr.slice(0, 8)}01`;
}

function prevMonth(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function endOfMonth(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  const date = new Date(y, m, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatCurrency(n: number) {
  return `₦${n.toLocaleString()}`;
}

export default function DashboardPage({
  role,
  onBack,
}: {
  role: string;
  onBack: () => void;
}) {
  const [preset, setPreset] = useState<RangePreset>("month");
  const [from, setFrom] = useState(startOfMonth(todayStr()));
  const [to, setTo] = useState(todayStr());
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [flagged, setFlagged] = useState<FlaggedItem[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    applyPreset(preset);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [from, to]);

  function applyPreset(p: RangePreset) {
    const today = todayStr();
    switch (p) {
      case "week":
        setFrom(startOfWeek(today));
        setTo(today);
        break;
      case "7days":
        setFrom(shiftDays(today, -6));
        setTo(today);
        break;
      case "month":
        setFrom(startOfMonth(today));
        setTo(today);
        break;
      case "lastmonth":
        setFrom(prevMonth(today));
        setTo(endOfMonth(prevMonth(today)));
        break;
    }
    setPreset(p);
  }

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const [revRes, flagRes, guestRes] = await Promise.all([
        apiFetch(`/revenue?from=${from}&to=${to}`),
        role === "admin"
          ? apiFetch("/monthly-stock-counts")
          : Promise.resolve(null),
        apiFetch("/guests"),
      ]);

      const revData = await revRes.json();
      if (!revRes.ok) {
        setError(revData.error || "Failed to load revenue.");
        return;
      }
      setRevenue(revData);

      if (flagRes) {
        const flagData = await flagRes.json();
        if (Array.isArray(flagData)) {
          setFlagged(
            flagData.filter((f: FlaggedItem) => f.status === "flagged"),
          );
        }
      }

      const guestData = await guestRes.json();
      setGuests(Array.isArray(guestData) ? guestData : []);
    } catch {
      setError("Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  const today = todayStr();
  const activeGuests = guests.filter((g) => {
    if (!g.date_of_arrival) return false;
    const arrival = g.date_of_arrival.slice(0, 10);
    const departure = g.date_of_departure?.slice(0, 10);
    return arrival <= today && (!departure || departure >= today);
  }).length;

  const maxDaily = revenue?.daily.length
    ? Math.max(...revenue.daily.map((d) => d.revenue))
    : 0;

  const avgDaily =
    revenue && revenue.daily.length > 0
      ? Math.round(revenue.total_revenue / revenue.daily.length)
      : 0;

  const bestDay = revenue?.daily.reduce(
    (best, d) => (d.revenue > best.revenue ? d : best),
    revenue.daily[0] ?? { date: "", revenue: 0 },
  );

  const topProducts = revenue
    ? Object.entries(
        revenue.details.reduce<Record<string, number>>((acc, d) => {
          acc[d.product_name] = (acc[d.product_name] || 0) + d.amount;
          return acc;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  return (
    <div className="dash-screen">
      <header className="dash-header">
        <button className="dash-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">Reporting &amp; Overview</p>
        </div>
      </header>

      <div className="dash-presets">
        {[
          { key: "week", label: "This week" },
          { key: "7days", label: "Last 7 days" },
          { key: "month", label: "This month" },
          { key: "lastmonth", label: "Last month" },
        ].map((p) => (
          <button
            key={p.key}
            className={`dash-preset ${preset === p.key ? "dash-preset--active" : ""}`}
            onClick={() => applyPreset(p.key as RangePreset)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="dash-custom-range">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
          />
          <span>→</span>
          <input
            type="date"
            value={to}
            min={from}
            max={todayStr()}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
          />
        </div>
      )}

      {error && <div className="dash-error">{error}</div>}

      {loading ? (
        <p className="dash-loading">Loading dashboard…</p>
      ) : (
        <>
          {/* Revenue cards */}
          <div className="dash-cards">
            <div className="dash-card">
              <span className="dash-card__label">Total revenue</span>
              <span className="dash-card__value">
                {formatCurrency(revenue?.total_revenue ?? 0)}
              </span>
              <span className="dash-card__sub">
                {from === to
                  ? formatShortDate(from)
                  : `${formatShortDate(from)} – ${formatShortDate(to)}`}
              </span>
            </div>
            <div className="dash-card">
              <span className="dash-card__label">Daily average</span>
              <span className="dash-card__value">
                {formatCurrency(avgDaily)}
              </span>
              <span className="dash-card__sub">
                {revenue?.daily.length ?? 0} day
                {revenue?.daily.length !== 1 ? "s" : ""} with sales
              </span>
            </div>
            <div className="dash-card">
              <span className="dash-card__label">Best day</span>
              <span className="dash-card__value">
                {bestDay ? formatCurrency(bestDay.revenue) : "—"}
              </span>
              <span className="dash-card__sub">
                {bestDay?.date ? formatShortDate(bestDay.date) : "—"}
              </span>
            </div>
          </div>

          {/* Bar chart */}
          {revenue && revenue.daily.length > 0 && (
            <div className="dash-chart-block">
              <h2 className="dash-section-title">Daily revenue</h2>
              <div className="dash-chart">
                {revenue.daily.map((d) => {
                  const heightPct =
                    maxDaily > 0 ? (d.revenue / maxDaily) * 100 : 0;
                  return (
                    <div key={d.date} className="dash-bar">
                      <div className="dash-bar__track">
                        <div
                          className="dash-bar__fill"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="dash-bar__label">
                        {new Date(d.date + "T00:00:00").toLocaleDateString(
                          "en-GB",
                          {
                            weekday: "narrow",
                          },
                        )}
                      </span>
                      <span className="dash-bar__value">
                        {formatCurrency(d.revenue)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active guests snapshot */}
          <div className="dash-snapshot">
            <div className="dash-snapshot__icon">🏨</div>
            <div className="dash-snapshot__body">
              <span className="dash-snapshot__value">{activeGuests}</span>
              <span className="dash-snapshot__label">
                Active guest{activeGuests !== 1 ? "s" : ""} checked in
              </span>
            </div>
          </div>

          {/* Flagged discrepancies (admin only) */}
          {role === "admin" && flagged.length > 0 && (
            <div className="dash-flagged">
              <h2 className="dash-section-title">⚠️ Flagged discrepancies</h2>
              <ul className="dash-flagged-list">
                {flagged.map((f) => (
                  <li key={f.id} className="dash-flagged-item">
                    <span className="dash-flagged__name">{f.product_name}</span>
                    <span className="dash-flagged__badge">
                      {f.discrepancy > 0 ? "+" : ""}
                      {f.discrepancy}
                    </span>
                    <span className="dash-flagged__detail">
                      Expected {f.system_closing_stock} · Counted{" "}
                      {f.physical_count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top products */}
          {topProducts.length > 0 && (
            <div className="dash-products">
              <h2 className="dash-section-title">Top products</h2>
              <ul className="dash-product-list">
                {topProducts.map(([name, amount]) => (
                  <li key={name} className="dash-product-item">
                    <span className="dash-product__name">{name}</span>
                    <span className="dash-product__amount">
                      {formatCurrency(amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
