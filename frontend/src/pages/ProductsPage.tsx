import { useEffect, useState } from "react";
import "./ProductsPage.css";
import { apiFetch } from "../config";

interface Product {
  id: string;
  name: string;
  category?: string;
  unit_price: number;
  current_stock: number;
}

export default function ProductsPage({
  role,
  onBack,
}: {
  role: string;
  onBack: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    unit_price: "",
    initial_quantity: "",
  });
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    loadProducts();
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

  function toggleOpen(p: Product) {
    if (openId === p.id) {
      setOpenId(null);
      return;
    }
    setPriceDrafts((d) => ({ ...d, [p.id]: String(p.unit_price) }));
    setOpenId(p.id);
  }

  async function handlePriceSave(productId: string) {
    const draft = priceDrafts[productId];
    if (!draft) return;

    setSavingId(productId);
    setError("");
    try {
      const res = await apiFetch(`/products/${productId}/price`, {
        method: "PATCH",
        body: JSON.stringify({ unit_price: Number(draft) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update price.");
        return;
      }
      await loadProducts();
      setOpenId(null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleAddProduct() {
    if (
      !newProduct.name ||
      !newProduct.unit_price ||
      !newProduct.initial_quantity
    )
      return;

    setAddSaving(true);
    setError("");
    try {
      const res = await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          name: newProduct.name,
          category: newProduct.category || undefined,
          unit_price: Number(newProduct.unit_price),
          initial_quantity: Number(newProduct.initial_quantity),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error?.formErrors?.join(", ") ||
            data.error ||
            "Failed to add product.",
        );
        return;
      }
      setNewProduct({
        name: "",
        category: "",
        unit_price: "",
        initial_quantity: "",
      });
      setShowAddForm(false);
      await loadProducts();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <div className="products-screen">
      <header className="products-header">
        <button className="products-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h1 className="products-title">Products</h1>
          <p className="products-subtitle">Bar / Drink Catalog</p>
        </div>
      </header>

      {role === "admin" && (
        <button
          className="products-add-toggle"
          onClick={() => setShowAddForm((s) => !s)}
        >
          {showAddForm ? "Cancel" : "+ Add new product"}
        </button>
      )}

      {showAddForm && (
        <div className="products-add-form">
          <label>
            <span>Product name</span>
            <input
              value={newProduct.name}
              onChange={(e) =>
                setNewProduct((n) => ({ ...n, name: e.target.value }))
              }
              placeholder="e.g. Star Beer"
            />
          </label>
          <label>
            <span>Category (optional)</span>
            <input
              value={newProduct.category}
              onChange={(e) =>
                setNewProduct((n) => ({ ...n, category: e.target.value }))
              }
              placeholder="e.g. Beer"
            />
          </label>
          <label>
            <span>Unit price (₦)</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={newProduct.unit_price}
              onChange={(e) =>
                setNewProduct((n) => ({ ...n, unit_price: e.target.value }))
              }
              placeholder="0"
            />
          </label>
          <label>
            <span>Starting stock (units on ground)</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={newProduct.initial_quantity}
              onChange={(e) =>
                setNewProduct((n) => ({
                  ...n,
                  initial_quantity: e.target.value,
                }))
              }
              placeholder="0"
            />
          </label>
          <button
            className="products-add-save"
            onClick={handleAddProduct}
            disabled={addSaving}
          >
            {addSaving ? "Saving…" : "Add product"}
          </button>
        </div>
      )}

      {error && <div className="products-error">{error}</div>}

      {loading ? (
        <p className="products-loading">Loading products…</p>
      ) : (
        <ul className="products-list">
          {products.map((p) => {
            const isOpen = openId === p.id;
            return (
              <li
                key={p.id}
                className={`products-item ${isOpen ? "products-item--open" : ""}`}
              >
                <button
                  className="products-item__row"
                  onClick={() => (role === "admin" ? toggleOpen(p) : undefined)}
                >
                  <span className="products-item__name">
                    {p.name}
                    {p.category && (
                      <span className="products-item__category">
                        {p.category}
                      </span>
                    )}
                  </span>
                  <span className="products-item__meta">
                    <span className="products-item__stock">
                      {p.current_stock} in stock
                    </span>
                    <span className="products-item__price">
                      ₦{p.unit_price.toLocaleString()}
                    </span>
                  </span>
                </button>

                {isOpen && role === "admin" && (
                  <div className="products-item__form">
                    <label>
                      <span>Update price (₦)</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={priceDrafts[p.id] ?? ""}
                        onChange={(e) =>
                          setPriceDrafts((d) => ({
                            ...d,
                            [p.id]: e.target.value,
                          }))
                        }
                        autoFocus
                      />
                    </label>
                    <button
                      className="products-item__save"
                      onClick={() => handlePriceSave(p.id)}
                      disabled={savingId === p.id}
                    >
                      {savingId === p.id ? "Saving…" : "Update price"}
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
