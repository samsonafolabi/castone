import "./HomePage.css";

interface HomePageProps {
  user: { full_name: string; role: string };
  onLogout: () => void;
  onNavigate: (module: string) => void;
}

const MODULES = [
  { key: "setup", label: "Hotel Setup", icon: IconKey },
  {
    key: "products",
    label: "Products",
    sub: "Bar / Drink Catalog",
    icon: IconBottle,
  },
  { key: "stock", label: "Stock Entries", icon: IconClipboard },
  { key: "guests", label: "Guests", icon: IconUsers },
  { key: "reconciliation", label: "Monthly Reconciliation", icon: IconScale },
  { key: "dashboard", label: "Dashboard", sub: "Reporting", icon: IconChart },
];

export default function HomePage({
  user,
  onLogout,
  onNavigate,
}: HomePageProps) {
  return (
    <div className="home-screen">
      <header className="home-header">
        <div>
          <p className="home-greeting">Welcome back,</p>
          <h1 className="home-name">{user.full_name}</h1>
        </div>
        <button className="home-logout" onClick={onLogout} aria-label="Log out">
          <IconLogout />
        </button>
      </header>

      <div className="home-grid">
        {MODULES.map((m) => (
          <button
            key={m.key}
            className="home-card"
            onClick={() => onNavigate(m.key)}
          >
            <span className="home-card__icon">
              <m.icon />
            </span>
            <span className="home-card__label">{m.label}</span>
            {m.sub && <span className="home-card__sub">{m.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// Minimal line icons, kept consistent weight/style with the brass accent
function IconKey() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M16 5l2 2M19 8l2 2" strokeLinecap="round" />
    </svg>
  );
}
function IconBottle() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M10 2h4v4l2 2v12a1 1 0 01-1 1H9a1 1 0 01-1-1V8l2-2V2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 13h6" strokeLinecap="round" />
    </svg>
  );
}
function IconClipboard() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2h6v3H9z" />
      <path d="M8 11h8M8 15h8M8 19h5" strokeLinecap="round" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14a5 5 0 015 5.5" strokeLinecap="round" />
    </svg>
  );
}
function IconScale() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M12 3v18M6 7h12M6 7l-3 6a3 3 0 006 0l-3-6zM18 7l-3 6a3 3 0 006 0l-3-6z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconChart() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      width="20"
      height="20"
    >
      <path
        d="M15 17l5-5-5-5M20 12H9M12 3H6a2 2 0 00-2 2v14a2 2 0 002 2h6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
