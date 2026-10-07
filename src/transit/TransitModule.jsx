import { useEffect, useMemo, useState } from "react";

const PROGRESS = {
  standby: "Stand-By",
  moving: "Moving",
  completed: "Completed",
};

function localDateTimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function itemLabel(item) {
  if (!item) return "Unknown item";
  return `${item.serial_number || "No serial number"} · ${item.item_type || "Item"}`;
}

function TransitForm({
  supabase,
  items,
  eligibleItems,
  locations,
  machineComponents,
  editRecord,
  initialItemIds,
  onClose,
  onSaved,
  mode = "edit",
}) {
  const [selectedItemIds, setSelectedItemIds] = useState(initialItemIds || []);
  const [fromLocationId, setFromLocationId] = useState(editRecord?.from_location_id || "");
  const [toLocationId, setToLocationId] = useState(editRecord?.to_location_id || "");
  const [sender, setSender] = useState(editRecord?.sender || "");
  const [carrier, setCarrier] = useState(editRecord?.carrier || "");
  const [sendAt, setSendAt] = useState(
    editRecord?.send_at ? localDateTimeValue(new Date(editRecord.send_at)) : localDateTimeValue()
  );
  const [receiver, setReceiver] = useState(editRecord?.receiver || "");
  const [receiveAt, setReceiveAt] = useState(
    editRecord?.receive_at ? localDateTimeValue(new Date(editRecord.receive_at)) : ""
  );
  const [notes, setNotes] = useState(editRecord?.notes || "");
  const [itemSearch, setItemSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const itemMap = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items]);
  const componentMap = useMemo(() => {
    const map = {};
    machineComponents.forEach((row) => {
      if (!map[row.machine_item_id]) map[row.machine_item_id] = [];
      map[row.machine_item_id].push(row.component_item_id);
    });
    return map;
  }, [machineComponents]);

  const lockedChildIds = useMemo(() => {
    const ids = new Set();
    selectedItemIds.forEach((id) => {
      (componentMap[id] || []).forEach((childId) => ids.add(childId));
    });
    return ids;
  }, [selectedItemIds, componentMap]);

  const selectedDisplayItems = useMemo(
    () => selectedItemIds.map((id) => itemMap[id]).filter(Boolean),
    [selectedItemIds, itemMap]
  );

  const filteredEligibleItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    return eligibleItems.filter((item) => {
      if (!query) return true;
      return itemLabel(item).toLowerCase().includes(query);
    });
  }, [eligibleItems, itemSearch]);

  function toggleItem(itemId) {
    setSelectedItemIds((current) => {
      if (current.includes(itemId)) {
        const next = current.filter((id) => id !== itemId);
        const childIds = new Set(componentMap[itemId] || []);
        return next.filter((id) => !childIds.has(id));
      }

      return [...current, itemId, ...(componentMap[itemId] || []).filter((id) => !current.includes(id))];
    });
  }

  function removeSelected(itemId) {
    if (lockedChildIds.has(itemId)) return;
    setSelectedItemIds((current) => current.filter((id) => id !== itemId));
  }

  async function save(event) {
    event.preventDefault();
    setError("");

    if (!fromLocationId) return setError("From location is required.");
    if (!toLocationId) return setError("To location is required.");
    if (fromLocationId === toLocationId) return setError("From and To locations must be different.");
    if (!sender.trim()) return setError("Sender is required.");
    if (!carrier.trim()) return setError("Carrier is required.");
    if (!sendAt) return setError("Send date/time is required.");

    if (mode !== "complete" && selectedItemIds.length === 0) {
      return setError("Select at least one Global Stock item.");
    }

    if (mode === "complete" && (!receiver.trim() || !receiveAt)) {
      return setError("Receiver and receive date/time are required to complete the Transit.");
    }

    setSaving(true);

    try {
      const payload = {
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        sender: sender.trim(),
        carrier: carrier.trim(),
        send_at: new Date(sendAt).toISOString(),
        receiver: receiver.trim() || null,
        receive_at: receiveAt ? new Date(receiveAt).toISOString() : null,
        notes: notes.trim() || null,
      };

      if (mode === "complete") {
        const { error: updateError } = await supabase
          .from("transits")
          .update({ ...payload, progress: PROGRESS.completed })
          .eq("id", editRecord.id);
        if (updateError) throw updateError;
      } else if (editRecord) {
        const { error: updateError } = await supabase
          .from("transits")
          .update(payload)
          .eq("id", editRecord.id);
        if (updateError) throw updateError;

        const existingResult = await supabase
          .from("transit_items")
          .select("id,item_id")
          .eq("transit_id", editRecord.id);
        if (existingResult.error) throw existingResult.error;

        const existingRows = existingResult.data || [];
        const desired = new Set(selectedItemIds);
        const existing = new Set(existingRows.map((row) => row.item_id));
        const removedRows = existingRows.filter((row) => !desired.has(row.item_id));

        // Remove a parent Machine before its auto-added children so the
        // database guard permits those child rows to disappear with the parent.
        const removedParentRows = removedRows.filter((row) =>
          machineComponents.some((mc) => mc.machine_item_id === row.item_id && !desired.has(row.item_id))
        );
        const removedChildRows = removedRows.filter((row) =>
          machineComponents.some((mc) => mc.component_item_id === row.item_id && !desired.has(mc.machine_item_id))
        );
        const removedOtherRows = removedRows.filter((row) =>
          !removedParentRows.some((parent) => parent.id === row.id)
          && !removedChildRows.some((child) => child.id === row.id)
        );

        for (const row of [...removedParentRows, ...removedOtherRows, ...removedChildRows]) {
          const { error: deleteError } = await supabase.from("transit_items").delete().eq("id", row.id);
          if (deleteError) throw deleteError;
        }

        const additions = selectedItemIds.filter((id) => !existing.has(id));
        for (const itemId of additions) {
          const { error: insertError } = await supabase.from("transit_items").insert({
            transit_id: editRecord.id,
            item_id: itemId,
          });
          if (insertError) throw insertError;
        }
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data: transit, error: insertError } = await supabase
          .from("transits")
          .insert({
            ...payload,
            progress: PROGRESS.standby,
            created_by: userData?.user?.id || null,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;

        for (const itemId of selectedItemIds) {
          const { error: itemError } = await supabase.from("transit_items").insert({
            transit_id: transit.id,
            item_id: itemId,
          });
          if (itemError) {
            await supabase.from("transits").delete().eq("id", transit.id);
            throw itemError;
          }
        }
      }

      await onSaved();
    } catch (saveError) {
      setError(saveError?.message || "The Transit could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "complete"
    ? "Complete Transit"
    : editRecord
      ? "Edit Transit"
      : "Create Transit";

  return (
    <div className="modal-backdrop">
      <div className="modal-card transit-modal">
        <div className="modal-header">
          <div>
            <p className="section-kicker">{mode === "complete" ? "COMPLETE TRANSIT" : editRecord ? "EDIT TRANSIT" : "NEW TRANSIT"}</p>
            <h2>{title}</h2>
            <p>{mode === "complete" ? "Receiver and receive date/time are required before completion." : "A Transit starts in Stand-By and can contain one or more Global Stock items."}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="transit-form" onSubmit={save}>
          {mode !== "complete" && (
            <div className="transit-item-picker">
              <div className="transit-field-heading">
                <div>
                  <strong>Global Stock items *</strong>
                  <span>Select at least one item.</span>
                </div>
                <span className="history-count">{selectedItemIds.length} selected</span>
              </div>

              <input
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Search serial number or item type"
              />

              <div className="transit-item-options">
                {filteredEligibleItems.length === 0 ? (
                  <div className="history-empty">No eligible items found.</div>
                ) : filteredEligibleItems.map((item) => {
                  const checked = selectedItemIds.includes(item.id);
                  const hasComponents = (componentMap[item.id] || []).length > 0;
                  return (
                    <label key={item.id} className={checked ? "transit-item-option selected" : "transit-item-option"}>
                      <input type="checkbox" checked={checked} onChange={() => toggleItem(item.id)} />
                      <span>
                        <strong>{itemLabel(item)}</strong>
                        <small>{item.inventory_status_name || "—"}{hasComponents ? ` · ${componentMap[item.id].length} installed component${componentMap[item.id].length === 1 ? "" : "s"} auto-added` : ""}</small>
                      </span>
                    </label>
                  );
                })}
              </div>

              {selectedDisplayItems.length > 0 && (
                <div className="transit-selected-items">
                  <div className="transit-field-heading">
                    <div><strong>Selected items</strong><span>Installed components are locked to their parent Machine.</span></div>
                  </div>
                  {selectedDisplayItems.map((item) => {
                    const locked = lockedChildIds.has(item.id);
                    return (
                      <div className="transit-selected-row" key={item.id}>
                        <div>
                          <strong>{itemLabel(item)}</strong>
                          <span>{locked ? "Installed component · removed with parent Machine" : item.item_type}</span>
                        </div>
                        {!locked && (
                          <button type="button" className="table-button delete-button" onClick={() => removeSelected(item.id)}>
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="transit-form-grid">
            <label className="redesign-field">
              <span>From location *</span>
              <select value={fromLocationId} onChange={(event) => setFromLocationId(event.target.value)} required>
                <option value="">Select location</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>

            <label className="redesign-field">
              <span>To location *</span>
              <select value={toLocationId} onChange={(event) => setToLocationId(event.target.value)} required>
                <option value="">Select destination</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>

            <label className="redesign-field">
              <span>Sender *</span>
              <input value={sender} onChange={(event) => setSender(event.target.value)} placeholder="Sender" required />
            </label>

            <label className="redesign-field">
              <span>Carrier *</span>
              <input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Carrier" required />
            </label>

            <label className="redesign-field">
              <span>Send date & time *</span>
              <input type="datetime-local" value={sendAt} onChange={(event) => setSendAt(event.target.value)} required />
            </label>

            <label className="redesign-field">
              <span>Receiver{mode === "complete" ? " *" : ""}</span>
              <input value={receiver} onChange={(event) => setReceiver(event.target.value)} placeholder={mode === "complete" ? "Receiver" : "Optional until completion"} required={mode === "complete"} />
            </label>

            <label className="redesign-field">
              <span>Receive date & time{mode === "complete" ? " *" : ""}</span>
              <input type="datetime-local" value={receiveAt} onChange={(event) => setReceiveAt(event.target.value)} required={mode === "complete"} />
            </label>

            <label className="redesign-field transit-wide">
              <span>Note <em>· Optional</em></span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="4" placeholder="Optional Transit note" />
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : mode === "complete" ? "Complete Transit" : editRecord ? "Save changes" : "Create Transit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ItemTransitHistory({ supabase, itemId }) {
  const [transits, setTransits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadHistory() {
      setLoading(true);
      setError("");

      const itemsResult = await supabase
        .from("transit_items")
        .select("transit_id")
        .eq("item_id", itemId);

      if (!alive) return;
      if (itemsResult.error) {
        setError(itemsResult.error.message);
        setLoading(false);
        return;
      }

      const transitIds = (itemsResult.data || []).map((row) => row.transit_id);
      if (transitIds.length === 0) {
        setTransits([]);
        setLoading(false);
        return;
      }

      const { data, error: transitError } = await supabase
        .from("transits")
        .select("id,from_location_id,to_location_id,sender,carrier,send_at,receiver,receive_at,progress,notes,created_at")
        .in("id", transitIds)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (transitError) setError(transitError.message);
      else setTransits(data || []);
      setLoading(false);
    }

    loadHistory();
    return () => { alive = false; };
  }, [supabase, itemId]);

  const [locations, setLocations] = useState([]);
  useEffect(() => {
    supabase.from("locations").select("id,name").order("name").then(({ data }) => setLocations(data || []));
  }, [supabase]);

  const locationMap = useMemo(() => Object.fromEntries(locations.map((row) => [row.id, row.name])), [locations]);

  return (
    <div className="item-transit-history">
      <div className="item-transit-history-header">
        <div>
          <p className="section-kicker">MOVEMENT HISTORY</p>
          <h3>Transit / Movement History</h3>
          <p>Transits containing this individual inventory item.</p>
        </div>
        {transits.length > 0 && <span className="history-count">{transits.length} Transit{transits.length === 1 ? "" : "s"}</span>}
      </div>

      {loading ? (
        <div className="history-empty">Loading movement history...</div>
      ) : error ? (
        <div className="error-message history-error">{error}</div>
      ) : transits.length === 0 ? (
        <div className="history-empty">No transit history recorded for this item.</div>
      ) : (
        <div className="transit-history-list">
          {transits.map((transit) => (
            <div className="transit-history-row" key={transit.id}>
              <div className="transit-history-date"><strong>{formatDate(transit.created_at)}</strong></div>
              <div className="transit-history-route">
                <div className="transit-history-route-line">
                  <strong>{locationMap[transit.from_location_id] || "—"}</strong>
                  <span>→</span>
                  <strong>{locationMap[transit.to_location_id] || "—"}</strong>
                </div>
                <div className="transit-history-meta">
                  <span className={`status-pill transit-progress-pill transit-progress-${transit.progress.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{transit.progress}</span>
                  <span>Sender: {transit.sender}</span>
                  <span>Carrier: {transit.carrier}</span>
                </div>
                {transit.receive_at && <p>Received by {transit.receiver || "—"} on {formatDate(transit.receive_at)}</p>}
                {transit.notes && <p>{transit.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TransitCard({ transit, itemMap, locationMap, canEdit, onEdit, onStartMoving, onComplete }) {
  const transitItems = transit.item_ids.map((id) => itemMap[id]).filter(Boolean);

  return (
    <article className={`transit-box transit-box-${transit.progress.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      <div className="transit-box-header">
        <div>
          <p className="section-kicker">TRANSIT</p>
          <h3>{locationMap[transit.from_location_id] || "—"} <span>→</span> {locationMap[transit.to_location_id] || "—"}</h3>
          <p>Created {formatDate(transit.created_at)}</p>
        </div>
        <span className={`transit-progress-badge transit-progress-${transit.progress.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{transit.progress}</span>
      </div>

      <div className="transit-box-grid">
        <div>
          <span className="transit-label">Sender</span>
          <strong>{transit.sender}</strong>
        </div>
        <div>
          <span className="transit-label">Carrier</span>
          <strong>{transit.carrier}</strong>
        </div>
        <div>
          <span className="transit-label">Send date & time</span>
          <strong>{formatDate(transit.send_at)}</strong>
        </div>
        {transit.receiver && (
          <div>
            <span className="transit-label">Receiver</span>
            <strong>{transit.receiver}</strong>
          </div>
        )}
        {transit.receive_at && (
          <div>
            <span className="transit-label">Receive date & time</span>
            <strong>{formatDate(transit.receive_at)}</strong>
          </div>
        )}
      </div>

      <div className="transit-box-items">
        <div className="transit-field-heading">
          <div><strong>Items</strong><span>{transitItems.length} item{transitItems.length === 1 ? "" : "s"}</span></div>
        </div>
        <div className="transit-box-item-list">
          {transitItems.map((item) => <button key={item.id} type="button" className="inline-machine-link" onClick={() => onEdit?.("item", item.id)}>{itemLabel(item)}</button>)}
        </div>
      </div>

      {transit.notes && <div className="transit-box-note"><span className="transit-label">Note</span><p>{transit.notes}</p></div>}

      {canEdit && (
        <div className="transit-box-actions">
          {transit.progress === PROGRESS.standby && (
            <>
              <button className="secondary-button" onClick={() => onEdit?.("edit", transit)}>Edit</button>
              <button className="primary-button" onClick={() => onStartMoving(transit)}>Start Moving</button>
            </>
          )}
          {transit.progress === PROGRESS.moving && (
            <button className="primary-button" onClick={() => onEdit?.("complete", transit)}>Receive & Complete</button>
          )}
        </div>
      )}
    </article>
  );
}

export default function TransitModule({ supabase, canEdit, onItemClick }) {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [machineComponents, setMachineComponents] = useState([]);
  const [transits, setTransits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState("edit");
  const [editingTransit, setEditingTransit] = useState(null);
  const [editingItemIds, setEditingItemIds] = useState([]);
  const [completedVisible, setCompletedVisible] = useState(1);

  async function load() {
    setLoading(true);
    setError("");

    const [itemsResult, locationsResult, componentsResult, transitResult, transitItemsResult] = await Promise.all([
      supabase.from("items").select("id,serial_number,item_type,current_location_id,inventory_status_id,inventory_statuses(name)").order("serial_number"),
      supabase.from("locations").select("id,name,is_active").order("name"),
      supabase.from("machine_components").select("machine_item_id,component_item_id"),
      supabase.from("transits").select("id,from_location_id,to_location_id,sender,carrier,send_at,receiver,receive_at,notes,progress,created_at,updated_at").order("created_at", { ascending: false }),
      supabase.from("transit_items").select("id,transit_id,item_id").order("created_at"),
    ]);

    const failed = [itemsResult, locationsResult, componentsResult, transitResult, transitItemsResult].find((result) => result.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    const itemRows = (itemsResult.data || []).map((item) => ({
      ...item,
      inventory_status_name: item.inventory_statuses?.name || "—",
    }));

    const itemMap = Object.fromEntries(itemRows.map((item) => [item.id, item]));
    const itemIdsByTransit = {};
    (transitItemsResult.data || []).forEach((row) => {
      if (!itemIdsByTransit[row.transit_id]) itemIdsByTransit[row.transit_id] = [];
      itemIdsByTransit[row.transit_id].push(row.item_id);
    });

    setItems(itemRows);
    setLocations((locationsResult.data || []).filter((row) => row.is_active !== false));
    setMachineComponents(componentsResult.data || []);
    setTransits((transitResult.data || []).map((transit) => ({
      ...transit,
      item_ids: itemIdsByTransit[transit.id] || [],
      item_count: (itemIdsByTransit[transit.id] || []).length,
      hasMissingItems: (itemIdsByTransit[transit.id] || []).some((id) => !itemMap[id]),
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, [supabase]);

  const itemMap = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items]);
  const locationMap = useMemo(() => Object.fromEntries(locations.map((row) => [row.id, row.name])), [locations]);

  const eligibleItems = useMemo(
    () => items.filter((item) => ["Idle", "In Repair", "SOLD"].includes(item.inventory_status_name)),
    [items]
  );

  const filteredTransits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transits.filter((transit) => {
      const transitItemValues = transit.item_ids.map((id) => itemMap[id]).filter(Boolean);
      const matchesSearch = !query || [
        transit.sender,
        transit.carrier,
        transit.receiver,
        transit.notes,
        locationMap[transit.from_location_id],
        locationMap[transit.to_location_id],
        transit.progress,
        ...transitItemValues.flatMap((item) => [item.serial_number, item.item_type]),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));

      const matchesLocation = locationFilter === "all"
        || transit.from_location_id === locationFilter
        || transit.to_location_id === locationFilter;

      return matchesSearch && matchesLocation;
    });
  }, [transits, itemMap, locationMap, search, locationFilter]);

  const grouped = useMemo(() => ({
    [PROGRESS.moving]: filteredTransits.filter((x) => x.progress === PROGRESS.moving),
    [PROGRESS.standby]: filteredTransits.filter((x) => x.progress === PROGRESS.standby),
    [PROGRESS.completed]: filteredTransits.filter((x) => x.progress === PROGRESS.completed),
  }), [filteredTransits]);

  function openCreate() {
    setEditingTransit(null);
    setEditingItemIds([]);
    setFormMode("edit");
    setShowForm(true);
  }

  async function openEdit(transit) {
    const { data, error: itemError } = await supabase
      .from("transit_items")
      .select("item_id")
      .eq("transit_id", transit.id);

    if (itemError) {
      setError(itemError.message);
      return;
    }

    setEditingTransit(transit);
    setEditingItemIds((data || []).map((row) => row.item_id));
    setFormMode("edit");
    setShowForm(true);
  }

  function openComplete(transit) {
    setEditingTransit(transit);
    setEditingItemIds(transit.item_ids);
    setFormMode("complete");
    setShowForm(true);
  }

  async function startMoving(transit) {
    setError("");
    const { error: updateError } = await supabase
      .from("transits")
      .update({ progress: PROGRESS.moving })
      .eq("id", transit.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await load();
  }

  async function afterSave() {
    setShowForm(false);
    setEditingTransit(null);
    setEditingItemIds([]);
    await load();
  }

  function renderSection(title, key, className, list) {
    return (
      <section className={`transit-section transit-section-${className}`}>
        <div className="transit-section-heading">
          <div>
            <p className="section-kicker">TRANSIT</p>
            <h2>{title}</h2>
          </div>
          <span>{list.length} Transit{list.length === 1 ? "" : "s"}</span>
        </div>
        {list.length === 0 ? (
          <div className="transit-empty-section">No {title.toLowerCase()} transits.</div>
        ) : (
          <div className="transit-box-list">
            {list.slice(0, key === PROGRESS.completed ? completedVisible : list.length).map((transit) => (
              <TransitCard
                key={transit.id}
                transit={transit}
                itemMap={itemMap}
                locationMap={locationMap}
                canEdit={canEdit}
                onEdit={(action, value) => {
                  if (action === "item") onItemClick?.(value);
                  else if (action === "complete") openComplete(value);
                  else openEdit(value);
                }}
                onStartMoving={startMoving}
                onComplete={openComplete}
              />
            ))}
          </div>
        )}
        {key === PROGRESS.completed && completedVisible < list.length && (
          <button className="secondary-button transit-show-more" onClick={() => setCompletedVisible((value) => Math.min(value + 2, list.length))}>
            Show more
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="content-card transit-page">
      <div className="section-heading transit-header">
        <div>
          <p className="section-kicker">TRANSIT</p>
          <h2>Inventory Transits</h2>
          <p>Move one or more Global Stock items between locations.</p>
        </div>
        <div className="transit-header-actions">
          <button className="secondary-button" onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
          {canEdit && <button className="primary-button" onClick={openCreate}>+ Create Transit</button>}
        </div>
      </div>

      <div className="stock-filters transit-filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, sender, carrier, location..." />
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
          <option value="all">All locations</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </div>

      {error && <div className="error-message stock-error">{error}</div>}

      {loading ? (
        <div className="history-empty">Loading Transits...</div>
      ) : (
        <div className="transit-sections">
          {renderSection("Moving", PROGRESS.moving, "moving", grouped[PROGRESS.moving])}
          {renderSection("Stand-By", PROGRESS.standby, "standby", grouped[PROGRESS.standby])}
          {renderSection("Completed", PROGRESS.completed, "completed", grouped[PROGRESS.completed])}
        </div>
      )}

      {showForm && (
        <TransitForm
          supabase={supabase}
          items={items}
          eligibleItems={eligibleItems}
          locations={locations}
          machineComponents={machineComponents}
          editRecord={editingTransit}
          initialItemIds={editingItemIds}
          mode={formMode}
          onClose={() => { setShowForm(false); setEditingTransit(null); setEditingItemIds([]); }}
          onSaved={afterSave}
        />
      )}
    </section>
  );
}
