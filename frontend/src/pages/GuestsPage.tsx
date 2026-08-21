import { useEffect, useState } from "react";
import "./GuestsPage.css";

const API = "http://localhost:4000";

interface Guest {
  id: string;
  room_number?: string;
  full_name: string;
  nationality?: string;
  sex?: string;
  occupation?: string;
  phone_number?: string;
  contact_address?: string;
  id_type?: string;
  id_number?: string;
  place_of_issue?: string;
  date_of_arrival?: string;
  date_of_departure?: string;
  vehicle_reg_no?: string;
  mission?: string;
}

const emptyForm = {
  room_number: "",
  full_name: "",
  nationality: "",
  sex: "",
  occupation: "",
  phone_number: "",
  contact_address: "",
  id_type: "",
  id_number: "",
  place_of_issue: "",
  date_of_arrival: "",
  date_of_departure: "",
  vehicle_reg_no: "",
  mission: "",
};

export default function GuestsPage({
  role,

  onBack,
}: {
  role: string;
  hotelId: string;
  userId: string;
  onBack: () => void;
}) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const token = localStorage.getItem("token");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    loadGuests();
  }, []);

  async function loadGuests() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/guests`, { headers });
      const data = await res.json();
      setGuests(data);
    } catch {
      setError("Could not load guests.");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleRegister() {
    if (!form.full_name) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API}/guests`, {
        method: "POST",
        headers,
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError("Failed to register guest.");
        return;
      }
      setForm(emptyForm);
      setShowAddForm(false);
      await loadGuests();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setSaving(true);
    try {
      await fetch(`${API}/guests/${id}`, { method: "DELETE", headers });
      await loadGuests();
      setOpenId(null);
    } catch {
      setError("Failed to remove guest.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(g: Guest) {
    setEditForm({
      room_number: g.room_number || "",
      full_name: g.full_name || "",
      nationality: g.nationality || "",
      sex: g.sex || "",
      occupation: g.occupation || "",
      phone_number: g.phone_number || "",
      contact_address: g.contact_address || "",
      id_type: g.id_type || "",
      id_number: g.id_number || "",
      place_of_issue: g.place_of_issue || "",
      date_of_arrival: g.date_of_arrival ? g.date_of_arrival.slice(0, 10) : "",
      date_of_departure: g.date_of_departure
        ? g.date_of_departure.slice(0, 10)
        : "",
      vehicle_reg_no: g.vehicle_reg_no || "",
      mission: g.mission || "",
    });
    setEditingId(g.id);
  }

  function updateEditForm(field: keyof typeof emptyForm, value: string) {
    setEditForm((f) => ({ ...f, [field]: value }));
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API}/guests/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        setError("Failed to update guest.");
        return;
      }
      setEditingId(null);
      await loadGuests();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="guests-screen">
      <header className="guests-header">
        <button className="guests-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h1 className="guests-title">Guests</h1>
          <p className="guests-subtitle">Registration &amp; Records</p>
        </div>
      </header>

      <button
        className="guests-add-toggle"
        onClick={() => setShowAddForm((s) => !s)}
      >
        {showAddForm ? "Cancel" : "+ Register new guest"}
      </button>

      {showAddForm && (
        <div className="guests-form">
          <label>
            <span>Full name *</span>
            <input
              value={form.full_name}
              onChange={(e) => updateForm("full_name", e.target.value)}
              placeholder="e.g. Lucky Fibre"
            />
          </label>
          <label>
            <span>Room number</span>
            <input
              value={form.room_number}
              onChange={(e) => updateForm("room_number", e.target.value)}
              placeholder="e.g. 12"
            />
          </label>
          <div className="guests-form__row">
            <label>
              <span>Nationality</span>
              <input
                value={form.nationality}
                onChange={(e) => updateForm("nationality", e.target.value)}
                placeholder="Nigeria"
              />
            </label>
            <label>
              <span>Sex</span>
              <input
                value={form.sex}
                onChange={(e) => updateForm("sex", e.target.value)}
                placeholder="Male / Female"
              />
            </label>
          </div>
          <label>
            <span>Occupation</span>
            <input
              value={form.occupation}
              onChange={(e) => updateForm("occupation", e.target.value)}
            />
          </label>
          <label>
            <span>Phone number</span>
            <input
              value={form.phone_number}
              onChange={(e) => updateForm("phone_number", e.target.value)}
            />
          </label>
          <label>
            <span>Contact address</span>
            <input
              value={form.contact_address}
              onChange={(e) => updateForm("contact_address", e.target.value)}
            />
          </label>
          <div className="guests-form__row">
            <label>
              <span>ID type</span>
              <input
                value={form.id_type}
                onChange={(e) => updateForm("id_type", e.target.value)}
                placeholder="Passport / DL"
              />
            </label>
            <label>
              <span>ID number</span>
              <input
                value={form.id_number}
                onChange={(e) => updateForm("id_number", e.target.value)}
              />
            </label>
          </div>
          <label>
            <span>Place of issue</span>
            <input
              value={form.place_of_issue}
              onChange={(e) => updateForm("place_of_issue", e.target.value)}
            />
          </label>
          <div className="guests-form__row">
            <label>
              <span>Date of arrival</span>
              <input
                type="date"
                value={form.date_of_arrival}
                onChange={(e) => updateForm("date_of_arrival", e.target.value)}
              />
            </label>
            <label>
              <span>Date of departure</span>
              <input
                type="date"
                value={form.date_of_departure}
                onChange={(e) =>
                  updateForm("date_of_departure", e.target.value)
                }
              />
            </label>
          </div>
          <label>
            <span>Vehicle reg. no.</span>
            <input
              value={form.vehicle_reg_no}
              onChange={(e) => updateForm("vehicle_reg_no", e.target.value)}
            />
          </label>
          <label>
            <span>Mission (purpose of visit)</span>
            <input
              value={form.mission}
              onChange={(e) => updateForm("mission", e.target.value)}
            />
          </label>

          <button
            className="guests-form__save"
            onClick={handleRegister}
            disabled={saving || !form.full_name}
          >
            {saving ? "Saving…" : "Register guest"}
          </button>
        </div>
      )}

      {error && <div className="guests-error">{error}</div>}

      {loading ? (
        <p className="guests-loading">Loading guests…</p>
      ) : (
        <ul className="guests-list">
          {guests.map((g) => {
            const isOpen = openId === g.id;
            const isEditing = editingId === g.id;

            return (
              <li
                key={g.id}
                className={`guests-item ${isOpen ? "guests-item--open" : ""}`}
              >
                <button
                  className="guests-item__row"
                  onClick={() => setOpenId(isOpen ? null : g.id)}
                >
                  <span className="guests-item__name">
                    {g.full_name}
                    {g.room_number && (
                      <span className="guests-item__room">
                        Room {g.room_number}
                      </span>
                    )}
                  </span>
                  <span className="guests-item__dates">
                    {g.date_of_arrival
                      ? new Date(g.date_of_arrival).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short" },
                        )
                      : "—"}
                    {" → "}
                    {g.date_of_departure
                      ? new Date(g.date_of_departure).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short" },
                        )
                      : "—"}
                  </span>
                </button>

                {isOpen && (
                  <div className="guests-item__details">
                    {isEditing ? (
                      <>
                        <label>
                          <span>Full name</span>
                          <input
                            value={editForm.full_name}
                            onChange={(e) =>
                              updateEditForm("full_name", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>Room number</span>
                          <input
                            value={editForm.room_number}
                            onChange={(e) =>
                              updateEditForm("room_number", e.target.value)
                            }
                          />
                        </label>
                        <div className="guests-form__row">
                          <label>
                            <span>Nationality</span>
                            <input
                              value={editForm.nationality}
                              onChange={(e) =>
                                updateEditForm("nationality", e.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>Sex</span>
                            <input
                              value={editForm.sex}
                              onChange={(e) =>
                                updateEditForm("sex", e.target.value)
                              }
                            />
                          </label>
                        </div>
                        <label>
                          <span>Occupation</span>
                          <input
                            value={editForm.occupation}
                            onChange={(e) =>
                              updateEditForm("occupation", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>Phone number</span>
                          <input
                            value={editForm.phone_number}
                            onChange={(e) =>
                              updateEditForm("phone_number", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>Contact address</span>
                          <input
                            value={editForm.contact_address}
                            onChange={(e) =>
                              updateEditForm("contact_address", e.target.value)
                            }
                          />
                        </label>
                        <div className="guests-form__row">
                          <label>
                            <span>ID type</span>
                            <input
                              value={editForm.id_type}
                              onChange={(e) =>
                                updateEditForm("id_type", e.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>ID number</span>
                            <input
                              value={editForm.id_number}
                              onChange={(e) =>
                                updateEditForm("id_number", e.target.value)
                              }
                            />
                          </label>
                        </div>
                        <label>
                          <span>Place of issue</span>
                          <input
                            value={editForm.place_of_issue}
                            onChange={(e) =>
                              updateEditForm("place_of_issue", e.target.value)
                            }
                          />
                        </label>
                        <div className="guests-form__row">
                          <label>
                            <span>Date of arrival</span>
                            <input
                              type="date"
                              value={editForm.date_of_arrival}
                              onChange={(e) =>
                                updateEditForm(
                                  "date_of_arrival",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Date of departure</span>
                            <input
                              type="date"
                              value={editForm.date_of_departure}
                              onChange={(e) =>
                                updateEditForm(
                                  "date_of_departure",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                        </div>
                        <label>
                          <span>Vehicle reg. no.</span>
                          <input
                            value={editForm.vehicle_reg_no}
                            onChange={(e) =>
                              updateEditForm("vehicle_reg_no", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>Mission</span>
                          <input
                            value={editForm.mission}
                            onChange={(e) =>
                              updateEditForm("mission", e.target.value)
                            }
                          />
                        </label>

                        <div className="guests-item__edit-actions">
                          <button
                            className="guests-form__save"
                            onClick={() => handleUpdate(g.id)}
                            disabled={saving}
                          >
                            {saving ? "Saving…" : "Save changes"}
                          </button>
                          <button
                            className="guests-item__cancel"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p>
                          <span>Nationality</span>
                          {g.nationality || "—"}
                        </p>
                        <p>
                          <span>Phone</span>
                          {g.phone_number || "—"}
                        </p>
                        <p>
                          <span>ID</span>
                          {g.id_type
                            ? `${g.id_type} · ${g.id_number || "—"}`
                            : "—"}
                        </p>
                        <p>
                          <span>Mission</span>
                          {g.mission || "—"}
                        </p>

                        <div className="guests-item__edit-actions">
                          <button
                            className="guests-item__edit"
                            onClick={() => startEdit(g)}
                          >
                            Edit details
                          </button>
                          {role === "admin" && (
                            <button
                              className="guests-item__remove"
                              onClick={() => handleRemove(g.id)}
                              disabled={saving}
                            >
                              Remove guest
                            </button>
                          )}
                        </div>
                      </>
                    )}
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
