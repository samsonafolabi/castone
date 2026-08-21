import { useState } from "react";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import StockEntryPage from "./pages/StockEntryPage";
import ProductsPage from "./pages/ProductsPage";
import GuestsPage from "./pages/GuestsPage";
import ReconciliationPage from "./pages/ReconciliationPage";

function App() {
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<
    "home" | "stock" | "products" | "guests" | "reconciliation"
  >("home");

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null);
    setView("home");
  }

  function handleNavigate(module: string) {
    if (module === "stock") setView("stock");
    if (module === "products") setView("products");
    if (module === "guests") setView("guests");
    if (module === "reconciliation") setView("reconciliation");
  }

  if (!user) {
    return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
  }

  if (view === "stock") {
    return <StockEntryPage onBack={() => setView("home")} />;
  }

  if (view === "products") {
    return <ProductsPage role={user.role} onBack={() => setView("home")} />;
  }

  if (view === "guests") {
    return (
      <GuestsPage
        role={user.role}
        hotelId={user.hotel_id}
        userId={user.id}
        onBack={() => setView("home")}
      />
    );
  }

  if (view === "reconciliation") {
    return <ReconciliationPage onBack={() => setView("home")} />;
  }
  return (
    <HomePage user={user} onLogout={handleLogout} onNavigate={handleNavigate} />
  );
}

export default App;
