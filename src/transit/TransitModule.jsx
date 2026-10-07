import { useEffect, useMemo, useState } from "react";

function localDateTimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "T" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join(":");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function itemLabel(item) {
  const serial = item?.serial_number || "No serial number";
  return serial + " · " + (item?.item_type || "Item");
}

function TransitForm({ supabase, items, locations, statuses, editRecord, onClose, onSaved }) {
  const [itemId, setItemId] = useState(editRecord?.item_id || "");
  const [fromLocationId, setFromLocationId] = useState(editRecord?.from_location_id || "");
  const [toLocationId, setToLocationId] = useState(editRecord?.to_location_id || "");
  const [statusId, setStatusId] = useState(editRecord?.transit_status_id || "");
  const [occurredAt, setOccurredAt] = useState(
    editRecord?.occurred_at ? localDateTimeValue(new Date(editRecord.occurred_at)) : localDateTimeValue()
  );
  const [notes, setNotes] = useState(editRecord?.notes || "");
  const [itemSearch, setItemSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedItem = items.find((item) => item.id === itemId) || null;
  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => itemLabel(item).toLowerCase().includes(query));
  }, [items, itemSearch]);

  useEffect(() => {
    if (!editRecord && selectedItem) {
      setFromLocationId(selectedItem.current_location_id || "");
    }
  }, [selectedItem, editRecord]);

  async function save(event) {
    event.preventDefault();
    setError("");

    if (!itemId) return setError("Select an inventory item.");
    if (!fromLocationId) return setError("From location is required.");
    if (!toLocationId) return setError("To location is required.");
    if (fromLocationId === toLocationId) return setError("From and To locations must be different.");
    if (!statusId) return setError("Transit status is required.");
    if (!occurredAt) return setError("Date and time are required.");

    setSaving(true);

    const payload = {
      item_id: itemId,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      transit_status_id: statusId,
      occurred_at: new Date(occurredAt).toISOString(),
      notes: notes.trim() || null,
    };

    let result;
    if (editRecord) {
      result = await supabase.from("transit_records").update(payload).eq("id", editRecord.id);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      result = await supabase.from("transit_records").insert({
        ...payload,
        created_by: userData?.user?.id || null,
      });
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    await onSaved();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card transit-modal">
        <div className="modal-header">
          <div>
            <p className="section-kicker">{editRecord ? "EDIT TRANSIT" : "NEW TRANSIT"}</p>
            <h2>{editRecord ? "Edit transit record" : "Record inventory movement"}</h2>
            <p>Record one movement for one physical inventory item.</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="transit-form" onSubmit={save}>
          <div className="transit-form-grid">
            <label className="redesign-field transit-wide">
              <span>Inventory item *</span>
              <input
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Search serial number or item type"
                disabled={Boolean(editRecord)}
              />
              <select
                value={itemId}
                onChange={(event) => setItemId(event.target.value)}
                disabled={Boolean(editRecord)}
                required
              >
                <option value="">Select item</option>
                {filteredItems.map((item) => (
                  <option key={item.id} value={item.id}>{itemLabel(item)}</option>
                ))}
              </select>
            </label>

            <label className="redesign-field">
              <span>From location *</span>
              <select value={fromLocationId} onChange={(event) => setFromLocationId(event.target.value)} required>
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
              {selectedItem?.current_location_id && selectedItem.current_location_id !== fromLocationId && (
                <small className="transit-form-hint">
                  Current item location: {locations.find((x) => x.id === selectedItem.current_location_id)?.name || "Unknown"}
                </small>
              )}
            </label>

            <label className="redesign-field">
              <span>To location *</span>
              <select value={toLocationId} onChange={(event) => setToLocationId(event.target.value)} required>
                <option value="">Select destination</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>

            <label className="redesign-field">
              <span>Transit status *</span>
              <select value={statusId} onChange={(event) => setStatusId(event.target.value)} required>
                <option value="">Select transit status</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>{status.name}</option>
                ))}
              </select>
            </label>

            <label className="redesign-field">
              <span>Date & time *</span>
              <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required />
            </label>

            <label className="redesign-field transit-wide">
              <span>Notes <em>· Optional</em></span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="4" placeholder="Optional movement notes" />
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : editRecord ? "Save changes" : "Record movement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ItemTransitHistory({ supabase, itemId }) {
  const [records, setRecords] = useState([]);
  const [locations, setLocations] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadHistory() {
      setLoading(true);
      setError("");

      const [recordsResult, locationsResult, statusesResult] = await Promise.all([
        supabase.from("transit_records").select("id,from_location_id,to_location_id,transit_status_id,occurred_at,notes").eq("item_id", itemId).order("occurred_at", { ascending: false }),
        supabase.from("locations").select("id,name").order("name"),
        supabase.from("transit_statuses").select("id,name").order("name"),
      ]);

      if (!alive) return;

      const failed = [recordsResult, locationsResult, statusesResult].find((result) => result.error);
      if (failed) {
        setError(failed.error.message);
        setRecords([]);
        setLoading(false);
        return;
      }

      setRecords(recordsResult.data || []);
      setLocations(locationsResult.data || []);
      setStatuses(statusesResult.data || []);
      setLoading(false);
    }

    loadHistory();
    return () => { alive = false; };
  }, [supabase, itemId]);

  const locationMap = useMemo(() => Object.fromEntries(locations.map((row) => [row.id, row.name])), [locations]);
  const statusMap = useMemo(() => Object.fromEntries(statuses.map((row) => [row.id, row.name])), [statuses]);

  return (
    <div className="item-transit-history">
      <div className="item-transit-history-header">
        <div>
          <p className="section-kicker">MOVEMENT HISTORY</p>
          <h3>Transit / Movement History</h3>
          <p>Recorded movements for this individual inventory item.</p>
        </div>
        {records.length > 0 && <span className="history-count">{records.length} event{records.length === 1 ? "" : "s"}</span>}
      </div>

      {loading ? (
        <div className="history-empty">Loading movement history...</div>
      ) : error ? (
        <div className="error-message history-error">{error}</div>
      ) : records.length === 0 ? (
        <div className="history-empty">No transit history recorded for this item.</div>
      ) : (
        <div className="transit-history-list">
          {records.map((record) => (
            <div className="transit-history-row" key={record.id}>
              <div className="transit-history-date">
                <strong>{formatDate(record.occurred_at)}</strong>
              </div>
              <div className="transit-history-route">
                <div className="transit-history-route-line">
                  <strong>{locationMap[record.from_location_id] || "—"}</strong>
                  <span>→</span>
                  <strong>{locationMap[record.to_location_id] || "—"}</strong>
                </div>
                <div className="transit-history-meta">
                  <span className="status-pill">{statusMap[record.transit_status_id] || "—"}</span>
                </div>
                {record.notes && <p>{record.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TransitModule({ supabase, canEdit, canDelete, onItemClick }) {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  async function load() {
    setLoading(true);
    setError("");

    const [itemsResult, locationsResult, statusesResult, recordsResult] = await Promise.all([
      supabase.from("items").select("id,serial_number,item_type,current_location_id").order("serial_number"),
      supabase.from("locations").select("id,name,is_active").order("name"),
      supabase.from("transit_statuses").select("id,name,is_active").order("name"),
      supabase.from("transit_records").select("id,item_id,from_location_id,to_location_id,transit_status_id,occurred_at,notes,created_at,updated_at").order("occurred_at", { ascending: false }),
    ]);

    const failed = [itemsResult, locationsResult, statusesResult, recordsResult].find((result) => result.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setItems(itemsResult.data || []);
    setLocations((locationsResult.data || []).filter((row) => row.is_active !== false));
    setStatuses((statusesResult.data || []).filter((row) => row.is_active !== false));
    setRecords(recordsResult.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [supabase]);

  const itemMap = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items]);
  const locationMap = useMemo(() => Object.fromEntries(locations.map((row) => [row.id, row.name])), [locations]);
  const statusMap = useMemo(() => Object.fromEntries(statuses.map((row) => [row.id, row.name])), [statuses]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const item = itemMap[record.item_id];
      const matchesSearch = !query || [
        item?.serial_number,
        item?.item_type,
        locationMap[record.from_location_id],
        locationMap[record.to_location_id],
        statusMap[record.transit_status_id],
        record.notes,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus = statusFilter === "all" || record.transit_status_id === statusFilter;
      const matchesLocation = locationFilter === "all"
        || record.from_location_id === locationFilter
        || record.to_location_id === locationFilter;

      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [records, itemMap, locationMap, statusMap, search, statusFilter, locationFilter]);

  const stats = useMemo(() => ({
    total: records.length,
    items: new Set(records.map((record) => record.item_id)).size,
    locations: new Set(records.flatMap((record) => [record.from_location_id, record.to_location_id])).size,
  }), [records]);

  async function afterSave() {
    setShowForm(false);
    setEditingRecord(null);
    await load();
  }

  async function deleteRecord(record) {
    if (!canDelete) return;
    if (!window.confirm("Delete this transit record? This cannot be undone.")) return;

    setError("");
    const result = await supabase.from("transit_records").delete().eq("id", record.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  return (
    <section className="content-card transit-page">
      <div className="section-heading transit-header">
        <div>
          <p className="section-kicker">TRANSIT</p>
          <h2>Inventory movement history</h2>
          <p>Record and review physical movements of individual inventory items between locations.</p>
        </div>
        <div className="transit-header-actions">
          <button className="secondary-button" onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
          {canEdit && <button className="primary-button" onClick={() => { setEditingRecord(null); setShowForm(true); }}>+ Record movement</button>}
        </div>
      </div>

      <div className="transit-summary">
        <div><span>Movements</span><strong>{stats.total}</strong></div>
        <div><span>Items moved</span><strong>{stats.items}</strong></div>
        <div><span>Locations involved</span><strong>{stats.locations}</strong></div>
      </div>

      <div className="stock-filters transit-filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, location, status, notes..." />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All transit statuses</option>
          {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
        </select>
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
          <option value="all">All locations</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </div>

      {error && <div className="error-message stock-error">{error}</div>}

      <div className="stock-table-wrap transit-table-wrap">
        <table className="stock-table transit-table">
          <thead>
            <tr>
              <th>Date & time</th>
              <th>Item</th>
              <th>From</th>
              <th>To</th>
              <th>Transit status</th>
              <th>Notes</th>
              {(canEdit || canDelete) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {!loading && filteredRecords.length === 0 && (
              <tr><td colSpan={canEdit || canDelete ? 7 : 6} className="empty-cell">No transit records found.</td></tr>
            )}
            {filteredRecords.map((record) => {
              const item = itemMap[record.item_id];
              return (
                <tr key={record.id}>
                  <td><strong>{formatDate(record.occurred_at)}</strong></td>
                  <td>
                    <button type="button" className="inline-machine-link" onClick={() => onItemClick?.(record.item_id)}>
                      {itemLabel(item)}
                    </button>
                  </td>
                  <td>{locationMap[record.from_location_id] || "—"}</td>
                  <td>{locationMap[record.to_location_id] || "—"}</td>
                  <td><span className="status-pill">{statusMap[record.transit_status_id] || "—"}</span></td>
                  <td>{record.notes || "—"}</td>
                  {(canEdit || canDelete) && <td><div className="row-actions">
                    {canEdit && <button className="table-button" onClick={() => { setEditingRecord(record); setShowForm(true); }}>Edit</button>}
                    {canDelete && <button className="table-button delete-button" onClick={() => deleteRecord(record)}>Delete</button>}
                  </div></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <TransitForm
          supabase={supabase}
          items={items}
          locations={locations}
          statuses={statuses}
          editRecord={editingRecord}
          onClose={() => { setShowForm(false); setEditingRecord(null); }}
          onSaved={afterSave}
        />
      )}
    </section>
  );
}
