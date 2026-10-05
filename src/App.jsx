import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase";

const navItems = [
  { label: "Global Stock", icon: "▦" },
  { label: "Purchases", icon: "↘" },
  { label: "Shipments", icon: "⇄" },
  { label: "Sales", icon: "↗" },
  { label: "Admin / Master Data", icon: "⚙", adminOnly: true },
];

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      if (!data.session) {
        setError("Sign-in succeeded, but no active session was returned. Please try again.");
        return;
      }

      await onLogin(data.session);
    } catch (submitError) {
      setError(submitError?.message || "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">AM</div>
        <p className="eyebrow">ASIA MEDICORP</p>
        <h1>Inventory Management System</h1>
        <p className="login-copy">Sign in to access the secure inventory workspace.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="error-message">{error}</div>}

          <button className="primary-button login-button" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="login-footer">Access is controlled by your assigned IMS role.</p>
      </section>
    </main>
  );
}

function AddItemModal({ supabase, onClose, onSaved, onDeleted, canDelete = false, item = null }) {
  const [masters, setMasters] = useState({
    itemTypes: [],
    manufacturers: [],
    models: [],
    locations: [],
    statuses: [],
    qualities: [],
  });
  const [form, setForm] = useState({
    serial_number: "",
    item_type_id: "",
    manufacturer_id: "",
    model_id: "",
    item_detail: "",
    current_location_id: "",
    status_id: "",
    quality_status_id: "",
    quality_note: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const loadMasters = useCallback(async () => {
    setLoading(true);
    setError("");

    const results = await Promise.all([
      supabase.from("item_types").select("id, name").eq("is_active", true).order("name"),
      supabase.from("manufacturers").select("id, name").eq("is_active", true).order("name"),
      supabase.from("models").select("id, name, manufacturer_id").eq("is_active", true).order("name"),
      supabase.from("locations").select("id, name").eq("is_active", true).order("name"),
      supabase.from("statuses").select("id, name").eq("is_active", true).order("name"),
      supabase.from("quality_statuses").select("id, name").eq("is_active", true).order("name"),
    ]);

    const failed = results.find((result) => result.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    const [itemTypes, manufacturers, models, locations, statuses, qualities] = results.map(
      (result) => result.data || []
    );

    const stockStatus = statuses.find((value) => value.name === "In Stock");
    const goodQuality = qualities.find((value) => value.name === "Good");

    setMasters({ itemTypes, manufacturers, models, locations, statuses, qualities });
    setForm(
      item
        ? {
            serial_number: item.serial_number || "",
            item_type_id: item.item_type_id || "",
            manufacturer_id: item.manufacturer_id || "",
            model_id: item.model_id || "",
            item_detail: item.item_detail || "",
            current_location_id: item.current_location_id || "",
            status_id: item.status_id || "",
            quality_status_id: item.quality_status_id || "",
            quality_note: item.quality_note || "",
          }
        : {
            serial_number: "",
            item_type_id: "",
            manufacturer_id: "",
            model_id: "",
            item_detail: "",
            current_location_id: "",
            status_id: stockStatus?.id || "",
            quality_status_id: goodQuality?.id || "",
            quality_note: "",
          }
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  const availableModels = useMemo(
    () =>
      masters.models.filter(
        (model) => !form.manufacturer_id || model.manufacturer_id === form.manufacturer_id
      ),
    [masters.models, form.manufacturer_id]
  );

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "manufacturer_id" ? { model_id: "" } : {}),
    }));
  }

  async function handleDelete() {
    if (!item || !canDelete || deleting || saving) return;

    const identifier = item.serial_number || item.item_detail || "this inventory item";
    if (!window.confirm('Permanently delete "' + identifier + '"? This cannot be undone.')) {
      return;
    }

    setDeleting(true);
    setError("");

    const { error: deleteError } = await supabase
      .from("items")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    if (onDeleted) onDeleted();
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      serial_number: form.serial_number.trim() || null,
      item_type_id: form.item_type_id,
      manufacturer_id: form.manufacturer_id || null,
      model_id: form.model_id || null,
      item_detail: form.item_detail.trim() || null,
      current_location_id: form.current_location_id || null,
      status_id: form.status_id,
      quality_status_id: form.quality_status_id,
      quality_note: form.quality_note.trim() || null,
    };

    const result = item
      ? await supabase.from("items").update(payload).eq("id", item.id)
      : await supabase.from("items").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="section-kicker">INVENTORY</p>
            <h2>{item ? "Edit inventory item" : "Add inventory item"}</h2>
            <p>{item ? "Update the details of this physical inventory item." : "Create one physical item record in Global Stock."}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading ? (
          <div className="modal-loading">Loading master data...</div>
        ) : (
          <form className="item-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Item type *
                <select value={form.item_type_id} onChange={(event) => updateField("item_type_id", event.target.value)} required>
                  <option value="">Select type</option>
                  {masters.itemTypes.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
                </select>
              </label>

              <label>
                Serial number
                <input value={form.serial_number} onChange={(event) => updateField("serial_number", event.target.value)} placeholder="Optional" />
              </label>

              <label>
                Manufacturer
                <select value={form.manufacturer_id} onChange={(event) => updateField("manufacturer_id", event.target.value)}>
                  <option value="">
                    {masters.manufacturers.length ? "Not set" : "No manufacturers configured"}
                  </option>
                  {masters.manufacturers.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
                </select>
              </label>

              <label>
                Model
                <select value={form.model_id} onChange={(event) => updateField("model_id", event.target.value)} disabled={!form.manufacturer_id}>
                  <option value="">
                    {!form.manufacturer_id
                      ? "Select manufacturer first"
                      : availableModels.length
                        ? "Not set"
                        : "No models configured for this manufacturer"}
                  </option>
                  {availableModels.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
                </select>
              </label>

              <label>
                Location
                <select value={form.current_location_id} onChange={(event) => updateField("current_location_id", event.target.value)}>
                  <option value="">
                    {masters.locations.length ? "Not set" : "No locations configured"}
                  </option>
                  {masters.locations.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
                </select>
              </label>

              <label>
                Status *
                <select value={form.status_id} onChange={(event) => updateField("status_id", event.target.value)} required>
                  <option value="">Select status</option>
                  {masters.statuses.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
                </select>
              </label>

              <label>
                Quality *
                <select value={form.quality_status_id} onChange={(event) => updateField("quality_status_id", event.target.value)} required>
                  <option value="">Select quality</option>
                  {masters.qualities.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
                </select>
              </label>

              <label>
                Quality note
                <input value={form.quality_note} onChange={(event) => updateField("quality_note", event.target.value)} placeholder="Optional note" />
              </label>
            </div>

            <label>
              Item detail / description
              <textarea value={form.item_detail} onChange={(event) => updateField("item_detail", event.target.value)} placeholder="Free-text description of this physical item" rows="3" />
            </label>

            {error && <div className="error-message">{error}</div>}

            <div className="modal-actions">
              {item && canDelete && (
                <button
                  type="button"
                  className="danger-button modal-delete-button"
                  onClick={handleDelete}
                  disabled={saving || deleting}
                >
                  {deleting ? "Deleting..." : "Delete item"}
                </button>
              )}
              <div className="modal-actions-right">
                <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving || deleting}>
                  {saving ? (item ? "Saving..." : "Adding item...") : (item ? "Save changes" : "Add item")}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


function ItemDetailModal({ supabase, item, canEdit, canDelete, onClose, onEdit, onDeleted }) {
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState("");
  const [error, setError] = useState("");

  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    setError("");

    const { data, error: photosError } = await supabase
      .from("item_photos")
      .select("id, storage_path, caption, created_at")
      .eq("item_id", item.id)
      .order("created_at", { ascending: true });

    if (photosError) {
      setError(photosError.message);
      setPhotos([]);
      setLoadingPhotos(false);
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      setPhotos([]);
      setLoadingPhotos(false);
      return;
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("item-photos")
      .createSignedUrls(rows.map((row) => row.storage_path), 3600);

    if (signedError) {
      setError(signedError.message);
      setPhotos([]);
      setLoadingPhotos(false);
      return;
    }

    const signedMap = new Map(
      (signed || []).map((entry) => [entry.path, entry.signedUrl])
    );

    setPhotos(
      rows.map((row) => ({
        ...row,
        signedUrl: signedMap.get(row.storage_path) || "",
      }))
    );
    setLoadingPhotos(false);
  }, [supabase, item.id]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    setUploading(true);
    setError("");

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("Only image files can be uploaded.");
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError(`"${file.name}" is larger than the 10 MB limit.`);
        continue;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${item.id}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("item-photos")
        .upload(path, file, { upsert: false, contentType: file.type });

      if (uploadError) {
        setError(uploadError.message);
        continue;
      }

      const { error: insertError } = await supabase
        .from("item_photos")
        .insert({
          item_id: item.id,
          storage_path: path,
        });

      if (insertError) {
        await supabase.storage.from("item-photos").remove([path]);
        setError(insertError.message);
      }
    }

    setUploading(false);
    await loadPhotos();
  }

  async function handleDeletePhoto(photo) {
    if (deletingPhoto) return;
    if (!window.confirm("Delete this item photo? This cannot be undone.")) return;

    setDeletingPhoto(photo.id);
    setError("");

    const { error: storageError } = await supabase.storage
      .from("item-photos")
      .remove([photo.storage_path]);

    if (storageError) {
      setError(storageError.message);
      setDeletingPhoto("");
      return;
    }

    const { error: deleteError } = await supabase
      .from("item_photos")
      .delete()
      .eq("id", photo.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingPhoto("");
      return;
    }

    setDeletingPhoto("");
    await loadPhotos();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="detail-modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="section-kicker">INVENTORY ITEM</p>
            <h2>{item.models?.name || item.item_types?.name || "Item detail"}</h2>
            <p>{item.serial_number || "No serial number recorded"}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="detail-content">
          <div className="detail-header-grid">
            <div className="detail-identity">
              <span className="detail-type">{item.item_types?.name || "Item"}</span>
              <h3>{item.models?.name || "Model not set"}</h3>
              <p>{item.manufacturers?.name || "Manufacturer not set"}</p>
              <div className="detail-badges">
                <span className="status-pill">{item.statuses?.name || "—"}</span>
                <span className="detail-quality">{item.quality_statuses?.name || "—"}</span>
              </div>
            </div>

            <div className="detail-actions">
              {canEdit && (
                <button className="secondary-button" onClick={() => onEdit(item)}>
                  Edit item
                </button>
              )}
              {canDelete && (
                <button
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm("Permanently delete this inventory item? This cannot be undone.")) {
                      onDeleted();
                    }
                  }}
                >
                  Delete item
                </button>
              )}
            </div>
          </div>

          <div className="detail-fields">
            <div><span>Serial number</span><strong>{item.serial_number || "—"}</strong></div>
            <div><span>Item type</span><strong>{item.item_types?.name || "—"}</strong></div>
            <div><span>Manufacturer</span><strong>{item.manufacturers?.name || "—"}</strong></div>
            <div><span>Model</span><strong>{item.models?.name || "—"}</strong></div>
            <div><span>Current location</span><strong>{item.locations?.name || "—"}</strong></div>
            <div><span>Status</span><strong>{item.statuses?.name || "—"}</strong></div>
            <div><span>Quality</span><strong>{item.quality_statuses?.name || "—"}</strong></div>
            <div><span>Created</span><strong>{item.created_at ? new Date(item.created_at).toLocaleString() : "—"}</strong></div>
          </div>

          <div className="detail-description">
            <span>Item detail / description</span>
            <p>{item.item_detail || "No description recorded."}</p>
          </div>

          {item.quality_note && (
            <div className="detail-note">
              <span>Quality note</span>
              <p>{item.quality_note}</p>
            </div>
          )}

          <div className="photo-section">
            <div className="photo-section-header">
              <div>
                <p className="section-kicker">PHOTOS</p>
                <h3>Item photos</h3>
                <p>Reference photos for this individual physical item.</p>
              </div>
              {canEdit && (
                <label className="secondary-button photo-upload-button">
                  {uploading ? "Uploading..." : "+ Add photos"}
                  <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={uploading} />
                </label>
              )}
            </div>

            {error && <div className="error-message detail-error">{error}</div>}

            {loadingPhotos ? (
              <div className="photo-empty">Loading photos...</div>
            ) : photos.length ? (
              <div className="photo-grid">
                {photos.map((photo) => (
                  <div className="photo-card" key={photo.id}>
                    {photo.signedUrl ? (
                      <img src={photo.signedUrl} alt={photo.caption || "Inventory item"} />
                    ) : (
                      <div className="photo-missing">Preview unavailable</div>
                    )}
                    {canEdit && (
                      <button
                        className="photo-delete"
                        onClick={() => handleDeletePhoto(photo)}
                        disabled={deletingPhoto === photo.id}
                        title="Delete photo"
                      >
                        {deletingPhoto === photo.id ? "..." : "×"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="photo-empty">No photos have been added to this item yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalStock({ supabase, canEdit, canDelete = false }) {
  const [items, setItems] = useState([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: itemsError } = await supabase
      .from("items")
      .select(
        `
          id,
          serial_number,
          item_detail,
          item_type_id,
          manufacturer_id,
          model_id,
          current_location_id,
          status_id,
          quality_status_id,
          quality_note,
          created_at,
          item_types(name),
          manufacturers(name),
          models(name),
          locations(name),
          statuses(name),
          quality_statuses(name)
        `
      )
      .order("created_at", { ascending: false });

    if (itemsError) {
      setError(itemsError.message);
      setItems([]);
    } else {
      setItems(data || []);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const types = useMemo(
    () => [...new Set(items.map((item) => item.item_types?.name).filter(Boolean))].sort(),
    [items]
  );

  const statuses = useMemo(
    () => [...new Set(items.map((item) => item.statuses?.name).filter(Boolean))].sort(),
    [items]
  );

  const locations = useMemo(
    () => [...new Set(items.map((item) => item.locations?.name).filter(Boolean))].sort(),
    [items]
  );

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const haystack = [
        item.serial_number,
        item.item_detail,
        item.item_types?.name,
        item.manufacturers?.name,
        item.models?.name,
        item.locations?.name,
        item.statuses?.name,
        item.quality_statuses?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!term || haystack.includes(term)) &&
        (typeFilter === "all" || item.item_types?.name === typeFilter) &&
        (statusFilter === "all" || item.statuses?.name === statusFilter) &&
        (locationFilter === "all" || item.locations?.name === locationFilter)
      );
    });
  }, [items, search, typeFilter, statusFilter, locationFilter]);

  return (
    <section className="stock-card">
      <div className="stock-toolbar">
        <div>
          <p className="section-kicker">LIVE INVENTORY</p>
          <h2>Global Stock</h2>
          <p>All individual inventory items currently recorded in the IMS.</p>
        </div>
        <div className="stock-actions">
          {canEdit && (
            <button className="primary-button" onClick={() => setShowAddItem(true)}>
              + Add item
            </button>
          )}
          <button className="secondary-button" onClick={loadItems} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="stock-filters">
        <input
          className="stock-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search serial, detail, manufacturer, model..."
        />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          {types.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
          <option value="all">All locations</option>
          {locations.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      <div className="stock-summary">
        <div><span>Total items</span><strong>{items.length}</strong></div>
        <div><span>Showing</span><strong>{filteredItems.length}</strong></div>
        <div><span>In stock</span><strong>{items.filter((item) => item.statuses?.name === "In Stock").length}</strong></div>
        <div><span>In transit</span><strong>{items.filter((item) => item.statuses?.name === "In Transit").length}</strong></div>
      </div>

      {error && <div className="error-message stock-error">{error}</div>}

      <div className="stock-table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Serial number</th>
              <th>Type</th>
              <th>Manufacturer / Model</th>
              <th>Detail</th>
              <th>Location</th>
              <th>Status</th>
              <th>Quality</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filteredItems.length === 0 && (
              <tr>
                <td colSpan="7" className="empty-cell">
                  {items.length === 0 ? "No inventory items have been added yet." : "No items match the current filters."}
                </td>
              </tr>
            )}
            {filteredItems.map((item) => (
              <tr
                key={item.id}
                className="stock-row-clickable"
                onClick={() => setDetailItem(item)}
                title="Click to view item details"
              >
                <td><strong>{item.serial_number || "—"}</strong></td>
                <td>{item.item_types?.name || "—"}</td>
                <td>
                  <span className="table-subtext manufacturer-text">{item.manufacturers?.name || "—"}</span>
                  <strong className="model-text">{item.models?.name || "Model not set"}</strong>
                </td>
                <td>{item.item_detail || "—"}</td>
                <td>{item.locations?.name || "—"}</td>
                <td><span className="status-pill">{item.statuses?.name || "—"}</span></td>
                <td>{item.quality_statuses?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAddItem && (
        <AddItemModal
          supabase={supabase}
          onClose={() => setShowAddItem(false)}
          onSaved={loadItems}
        />
      )}
      {detailItem && (
        <ItemDetailModal
          supabase={supabase}
          item={detailItem}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setDetailItem(null)}
          onEdit={(itemToEdit) => {
            setDetailItem(null);
            setEditingItem(itemToEdit);
          }}
          onDeleted={() => {
            setDetailItem(null);
            setEditingItem(null);
            loadItems();
          }}
        />
      )}
      {editingItem && (
        <AddItemModal
          supabase={supabase}
          item={editingItem}
          canDelete={canDelete}
          onClose={() => setEditingItem(null)}
          onSaved={loadItems}
          onDeleted={loadItems}
        />
      )}
    </section>
  );
}


const MASTER_DEFINITIONS = [
  { key: "item_types", label: "Item Types", singular: "item type" },
  { key: "manufacturers", label: "Manufacturers", singular: "manufacturer" },
  { key: "models", label: "Models", singular: "model", needsManufacturer: true },
  { key: "locations", label: "Locations", singular: "location" },
  { key: "statuses", label: "Statuses", singular: "status" },
  { key: "quality_statuses", label: "Quality Statuses", singular: "quality status" },
  { key: "transit_statuses", label: "Transit Statuses", singular: "transit status" },
  { key: "suppliers", label: "Suppliers", singular: "supplier" },
  { key: "customers", label: "Customers", singular: "customer" },
];

function MasterData({ supabase }) {
  const [activeKey, setActiveKey] = useState("item_types");
  const [rows, setRows] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", manufacturer_id: "" });
  const [usage, setUsage] = useState({});
  const [error, setError] = useState("");

  const definition = MASTER_DEFINITIONS.find((item) => item.key === activeKey);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    const selectFields = definition.needsManufacturer
      ? "id, name, manufacturer_id, is_active"
      : "id, name, is_active";

    const { data, error: rowsError } = await supabase
      .from(activeKey)
      .select(selectFields)
      .order("name");

    if (rowsError) {
      setError(rowsError.message);
      setRows([]);
      setUsage({});
      setLoading(false);
      return;
    }

    const loadedRows = data || [];
    setRows(loadedRows);

    const usageResults = await Promise.all(
      loadedRows.map(async (row) => {
        const { data: count, error: usageError } = await supabase.rpc(
          "master_record_usage",
          { p_table_name: activeKey, p_record_id: row.id }
        );
        return { id: row.id, count: usageError ? null : Number(count || 0), error: usageError };
      })
    );

    const usageMap = {};
    const usageError = usageResults.find((result) => result.error);
    usageResults.forEach((result) => {
      usageMap[result.id] = result.count;
    });

    if (usageError) {
      setError(usageError.error.message);
    }
    setUsage(usageMap);
    setLoading(false);
  }, [supabase, activeKey, definition.needsManufacturer]);

  const loadManufacturers = useCallback(async () => {
    const { data, error: manufacturerError } = await supabase
      .from("manufacturers")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    if (manufacturerError) {
      setError(manufacturerError.message);
      return;
    }
    setManufacturers(data || []);
  }, [supabase]);

  useEffect(() => {
    loadRows();
    if (definition.needsManufacturer) loadManufacturers();
  }, [loadRows, loadManufacturers, definition.needsManufacturer]);

  function selectMaster(key) {
    setActiveKey(key);
    setEditing(null);
    setForm({ name: "", manufacturer_id: "" });
    setUsage({});
    setError("");
  }

  function beginAdd() {
    setEditing({ mode: "add" });
    setForm({ name: "", manufacturer_id: "" });
    setError("");
  }

  function beginEdit(row) {
    setEditing({ mode: "edit", id: row.id });
    setForm({ name: row.name, manufacturer_id: row.manufacturer_id || "" });
    setError("");
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ name: "", manufacturer_id: "" });
    setError("");
  }

  async function saveRow(event) {
    event.preventDefault();
    const name = form.name.trim();

    if (!name) {
      setError("Name is required.");
      return;
    }
    if (definition.needsManufacturer && !form.manufacturer_id) {
      setError("Select a manufacturer for this model.");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name,
      ...(definition.needsManufacturer ? { manufacturer_id: form.manufacturer_id } : {}),
    };

    const result = editing?.mode === "edit"
      ? await supabase.from(activeKey).update(payload).eq("id", editing.id)
      : await supabase.from(activeKey).insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    cancelEdit();
    await loadRows();
    if (activeKey === "manufacturers") await loadManufacturers();
  }


  async function deleteRow(row) {
    const count = usage[row.id];

    if (count === null || count === undefined || count > 0) return;

    if (!window.confirm('Permanently delete "' + row.name + '"? This cannot be undone.')) {
      return;
    }

    setError("");
    const { error: deleteError } = await supabase
      .from(activeKey)
      .delete()
      .eq("id", row.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await loadRows();
    if (activeKey === "manufacturers") await loadManufacturers();
  }

  async function toggleActive(row) {
    const action = row.is_active ? "deactivate" : "reactivate";
    if (!window.confirm(action[0].toUpperCase() + action.slice(1) + ' "' + row.name + '"?')) return;

    setError("");
    const { error: updateError } = await supabase
      .from(activeKey)
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadRows();
    if (activeKey === "manufacturers") await loadManufacturers();
  }

  const visibleRows = rows.filter((row) => showInactive || row.is_active);
  const manufacturerName = (id) =>
    manufacturers.find((manufacturer) => manufacturer.id === id)?.name || "Unknown manufacturer";

  return (
    <section className="master-card">
      <div className="master-header">
        <div>
          <p className="section-kicker">ADMINISTRATION</p>
          <h2>Master Data</h2>
          <p>Manage reusable values used throughout the IMS. Deactivated records remain in history.</p>
        </div>
        <div className="master-header-actions">
          <label className="inactive-toggle">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Show inactive
          </label>
          <button className="primary-button" onClick={beginAdd}>+ Add {definition.singular}</button>
        </div>
      </div>

      <div className="master-tabs">
        {MASTER_DEFINITIONS.map((item) => (
          <button
            key={item.key}
            className={item.key === activeKey ? "master-tab active" : "master-tab"}
            onClick={() => selectMaster(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="master-content">
        <div className="master-content-title">
          <div>
            <strong>{definition.label}</strong>
            <span>{visibleRows.length} record{visibleRows.length === 1 ? "" : "s"}</span>
          </div>
          <button className="secondary-button" onClick={loadRows} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {editing && (
          <form className="master-edit-form" onSubmit={saveRow}>
            <div className="master-form-field">
              <label>{definition.needsManufacturer ? "Model name" : definition.label.replace(/s$/, "") + " name"}</label>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={"Enter " + definition.singular + " name"}
                autoFocus
                required
              />
            </div>

            {definition.needsManufacturer && (
              <div className="master-form-field">
                <label>Manufacturer</label>
                <select value={form.manufacturer_id} onChange={(event) => setForm((current) => ({ ...current, manufacturer_id: event.target.value }))} required>
                  <option value="">Select manufacturer</option>
                  {manufacturers.map((manufacturer) => (
                    <option key={manufacturer.id} value={manufacturer.id}>{manufacturer.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="master-form-actions">
              <button type="button" className="secondary-button" onClick={cancelEdit}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving..." : editing.mode === "edit" ? "Save changes" : "Add"}
              </button>
            </div>
          </form>
        )}

        {error && <div className="error-message master-error">{error}</div>}

        <div className="master-table-wrap">
          <table className="master-table">
            <thead>
              <tr>
                <th>Name</th>
                {definition.needsManufacturer && <th>Manufacturer</th>}
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && visibleRows.length === 0 && (
                <tr><td colSpan={definition.needsManufacturer ? 4 : 3} className="empty-cell">No records found.</td></tr>
              )}
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  {definition.needsManufacturer && <td>{manufacturerName(row.manufacturer_id)}</td>}
                  <td><span className={row.is_active ? "active-pill" : "inactive-pill"}>{row.is_active ? "Active" : "Inactive"}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="table-button" onClick={() => beginEdit(row)}>Edit</button>
                      <button className="table-button" onClick={() => toggleActive(row)}>{row.is_active ? "Deactivate" : "Reactivate"}</button>
                      <button
                        className="table-button delete-button"
                        disabled={usage[row.id] !== 0}
                        title={
                          usage[row.id] === 0
                            ? "Permanently delete"
                            : usage[row.id] > 0
                              ? "Cannot delete: this value is in use"
                              : "Checking usage..."
                        }
                        onClick={() => deleteRow(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("Global Stock");
  const [error, setError] = useState("");

  const loadProfile = useCallback(async (userId) => {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", userId)
      .single();

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
      return false;
    }

    if (!data.is_active) {
      await supabase.auth.signOut();
      setError("Your IMS account is inactive. Please contact an administrator.");
      setSession(null);
      setProfile(null);
      return false;
    }

    setProfile(data);
    setError("");
    return true;
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return undefined;
    }

    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) return;

        setSession(nextSession);

        if (!nextSession) {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  async function handleLogin(nextSession) {
    const activeSession =
      nextSession || (await supabase.auth.getSession()).data.session;

    if (!activeSession) {
      throw new Error("No active session was returned after sign-in.");
    }

    setSession(activeSession);
    const loaded = await loadProfile(activeSession.user.id);

    if (!loaded) {
      throw new Error("The account signed in, but its IMS profile could not be loaded.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setActive("Global Stock");
  }

  if (!supabaseConfigured) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark">AM</div>
          <p className="eyebrow">CONFIGURATION REQUIRED</p>
          <h1>Supabase connection is not configured.</h1>
          <p className="login-copy">
            The deployment is missing its Supabase environment configuration.
            Check the GitHub Actions repository secrets and redeploy.
          </p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="login-shell">
        <section className="login-card loading-card">
          <div className="brand-mark">AM</div>
          <p>Loading secure workspace...</p>
        </section>
      </main>
    );
  }

  if (!session || !profile) {
    return <Login onLogin={handleLogin} />;
  }

  const visibleNav = navItems.filter(
    (item) => !item.adminOnly || profile.role === "admin"
  );

  return (
    <div className="ims-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AM</div>
          <div>
            <strong>ASIA MEDICORP</strong>
            <span>Inventory Management</span>
          </div>
        </div>

        <nav className="nav">
          <p className="nav-title">WORKSPACE</p>
          {visibleNav.map((item) => (
            <button
              key={item.label}
              className={active === item.label ? "nav-item active" : "nav-item"}
              onClick={() => setActive(item.label)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="secure-badge">● Secure workspace</div>
          <span>{profile.role.toUpperCase()} access</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">INVENTORY MANAGEMENT SYSTEM</p>
            <h1>{active}</h1>
          </div>
          <div className="user-area">
            <div>
              <strong>{profile.full_name || session.user.email}</strong>
              <span>{profile.role}</span>
            </div>
            <button className="signout-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        {active === "Global Stock" ? (
          <GlobalStock
            supabase={supabase}
            canEdit={profile.role === "admin" || profile.role === "manager"}
            canDelete={profile.role === "admin"}
          />
        ) : active === "Admin / Master Data" ? (
          <MasterData supabase={supabase} />
        ) : (
          <section className="content-card">
            <div className="section-heading">
              <div>
                <p className="section-kicker">{active.toUpperCase()}</p>
                <h2>Module ready</h2>
                <p>
                  Authentication and role access are connected. This module will
                  be built on the live IMS database next.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
