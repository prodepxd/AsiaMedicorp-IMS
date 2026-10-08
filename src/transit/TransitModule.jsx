import { useEffect, useMemo, useState } from "react";

const PROGRESS = {
  standby: "stand-by",
  moving: "moving",
  completed: "completed",
};

const PROGRESS_LABEL = {
  "stand-by": "Stand-By",
  moving: "Moving",
  completed: "Completed",
};

function localDateTimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return \`\${date.getFullYear()}-\${pad(date.getMonth() + 1)}-\${pad(date.getDate())}T\${pad(date.getHours())}:\${pad(date.getMinutes())}\`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function itemLabel(item) {
  if (!item) return "Unknown item";
  return \`\${item.serial_number || "No serial number"} · \${item.item_type || "Item"}\`;
}

function progressClass(progress) {
  return String(progress || "").replace(/[^a-z]+/g, "-");
}

function TransitForm({
  supabase,
  items,
  locations,
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
  const [sentAt, setSentAt] = useState(
    editRecord?.sent_at ? localDateTimeValue(new Date(editRecord.sent_at)) : localDateTimeValue()
  );
  const [receiver, setReceiver] = useState(editRecord?.receiver || "");
  const [receivedAt, setReceivedAt] = useState(
    editRecord?.received_at ? localDateTimeValue(new Date(editRecord.received_at)) : ""
  );
  const [note, setNote] = useState(editRecord?.note || "");
  const [itemSearch, setItemSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const itemMap = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items]);

  const selectedDisplayItems = useMemo(
    () => selectedItemIds.map((id) => itemMap[id]).filter(Boolean),
    [selectedItemIds, itemMap]
  );

  const selectedLocations = useMemo(
    () => [...new Set(selectedDisplayItems.map((item) => item.current_location_id).filter(Boolean))],
    [selectedDisplayItems]
  );

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (!item.current_location_id) return false;
      if (!query) return true;
      return itemLabel(item).toLowerCase().includes(query);
    });
  }, [items, itemSearch]);

  useEffect(() => {
    if (selectedLocations.length === 1) {
      setFromLocationId(selectedLocations[0]);
    } else if (selectedLocations.length === 0 && editRecord?.from_location_id) {
      setFromLocationId(editRecord.from_location_id);
    } else if (selectedLocations.length > 1) {
      setFromLocationId("");
    }
  }, [selectedLocations, editRecord?.from_location_id]);

  function toggleItem(itemId) {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    );
  }

  function removeSelected(itemId) {
    setSelectedItemIds((current) => current.filter((id) => id !== itemId));
  }

  async function save(event) {
    event.preventDefault();
    setError("");

    if (selectedItemIds.length === 0) return setError("Select at least one Global Stock item.");
    if (selectedLocations.length > 1) return setError("All selected items must currently be at the same location.");
    if (selectedLocations.length === 0) return setError("Selected items must have a current location.");
    if (!fromLocationId) return setError("The source location could not be determined from the selected items.");
    if (!toLocationId) return setError("To location is required.");
    if (fromLocationId === toLocationId) return setError("From and To locations must be different.");
    if (!sender.trim()) return setError("Sender is required.");
    if (!carrier.trim()) return setError("Carrier is required.");
    if (mode === "complete" && !sentAt) return setError("Sent date/time is required to complete the Transit.");
    if (mode === "complete" && (!receiver.trim() || !receivedAt)) {
      return setError("Receiver and received date/time are required to complete the Transit.");
    }

    setSaving(true);

    try {
      const payload = {
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        sent_at: sentAt ? new Date(sentAt).toISOString() : null,
        received_at: receivedAt ? new Date(receivedAt).toISOString() : null,
        sender: sender.trim(),
        receiver: receiver.trim() || null,
        carrier: carrier.trim(),
        note: note.trim() || null,
      };

      if (mode === "complete") {
        const { error: updateError } = await supabase
          .from("transits")
          .update({ ...payload, transit_progress: PROGRESS.completed })
          .eq("id", editRecord.id);
        if (updateError) throw updateError;

        const { error: itemUpdateError } = await supabase
          .from("transit_items")
          .update({ received_at: new Date(receivedAt).toISOString() })
          .eq("transit_id", editRecord.id);
        if (itemUpdateError) throw itemUpdateError;
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

        for (const row of existingRows.filter((row) => !desired.has(row.item_id))) {
          const { error: deleteError } = await supabase.from("transit_items").delete().eq("id", row.id);
          if (deleteError) throw deleteError;
        }

        for (const itemId of selectedItemIds.filter((id) => !existing.has(id))) {
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
            transit_progress: PROGRESS.standby,
            created_by: userData?.user?.id || null,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        const { error: itemError } = await supabase.from("transit_items").insert(
          selectedItemIds.map((itemId) => ({ transit_id: transit.id, item_id: itemId }))
        );
        if (itemError) {
          await supabase.from("transits").delete().eq("id", transit.id);
          throw itemError;
        }
      }

      await onSaved();
    } catch (saveError) {
      setError(saveError?.message || "The Transit could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "complete" ? "Complete Transit" : editRecord ? "Edit Transit" : "Create Transit";

  return (
    <div className="modal-backdrop">
      <div className="modal-card transit-modal">
        <div className="modal-header">
          <div>
            <p className="section-kicker">{mode === "complete" ? "COMPLETE TRANSIT" : editRecord ? "EDIT TRANSIT" : "NEW TRANSIT"}</p>
            <h2>{title}</h2>
            <p>
              {mode === "complete"
                ? "Record the receiver and received date/time before completion."
                : "A Transit can contain one or more Global Stock items. The source location is determined from the selected items."}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="transit-form" onSubmit={save}>
          {mode !== "complete" && (
            <div className="transit-item-picker">
              <div className="transit-field-heading">
                <div>
                  <strong>Global Stock items *</strong>
                  <span>Select one or more items.</span>
                </div>
                <span className="history-count">{selectedItemIds.length} selected</span>
              </div>

              <input
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Search serial number or item type"
              />

              <div className="transit-item-options">
                {filteredItems.length === 0 ? (
                  <div className="history-empty">No Global Stock items found.</div>
                ) : filteredItems.map((item) => {
                  const checked = selectedItemIds.includes(item.id);
                  return (
                    <label key={item.id} className={checked ? "transit-item-option selected" : "transit-item-option"}>
                      <input type="checkbox" checked={checked} onChange={() => toggleItem(item.id)} />
                      <span>
                        <strong>{itemLabel(item)}</strong>
                        <small>{item.inventory_status_name || "—"}</small>
                      </span>
                    </label>
                  );
                })}
              </div>

              {selectedDisplayItems.length > 0 && (
                <div className="transit-selected-items">
                  <div className="transit-field-heading">
                    <div><strong>Selected items</strong><span>All selected items must share the same current location.</span></div>
                  </div>
                  {selectedDisplayItems.map((item) => (
                    <div className="transit-selected-row" key={item.id}>
                      <div>
                        <strong>{itemLabel(item)}</strong>
                        <span>{item.inventory_status_name || "—"}</span>
                      </div>
                      <button type="button" className="table-button delete-button" onClick={() => removeSelected(item.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="transit-form-grid">
            <label className="redesign-field">
              <span>From location *</span>
              <select value={fromLocationId} disabled required>
                <option value="">Select items first</option>
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
              <span>Sent date & time{mode === "complete" ? " *" : ""}</span>
              <input type="datetime-local" value={sentAt} onChange={(event) => setSentAt(event.target.value)} required={mode === "complete"} />
            </label>

            <label className="redesign-field">
              <span>Receiver{mode === "complete" ? " *" : ""}</span>
              <input value={receiver} onChange={(event) => setReceiver(event.target.value)} placeholder={mode === "complete" ? "Receiver" : "Optional until completion"} required={mode === "complete"} />
            </label>

            <label className="redesign-field">
              <span>Received date & time{mode === "complete" ? " *" : ""}</span>
              <input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required={mode === "complete"} />
            </label>

            <label className="redesign-field transit-wide">
              <span>Transit note <em>· Optional</em></span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows="4" placeholder="Optional note for the overall Transit" />
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
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadHistory() {
      setLoading(true);
      setError("");

      const { data, error: historyError } = await supabase
        .from("transit_items")
        .select("id,received_at,note,created_at,transit_id,transits(id,from_location_id,to_location_id,sent_at,received_at,transit_progress,sender,receiver,carrier,note,created_at)")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (historyError) {
        setError(historyError.message);
        setRows([]);
      } else {
        setRows(data || []);
      }
      setLoading(false);
    }

    loadHistory();
    return () => { alive = false; };
  }, [supabase, itemId]);

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
          <p>Transit movement and item-specific receiving notes for this inventory item.</p>
        </div>
        {rows.length > 0 && <span className="history-count">{rows.length} Transit{rows.length === 1 ? "" : "s"}</span>}
      </div>

      {loading ? (
        <div className="history-empty">Loading movement history...</div>
      ) : error ? (
        <div className="error-message history-error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="history-empty">No transit history recorded for this item.</div>
      ) : (
        <div className="transit-history-list">
          {rows.map((row) => {
            const transit = row.transits;
            if (!transit) return null;
            return (
              <div className="transit-history-row" key={row.id}>
                <div className="transit-history-date"><strong>{formatDate(transit.sent_at || transit.created_at)}</strong></div>
                <div className="transit-history-route">
                  <div className="transit-history-route-line">
                    <strong>{locationMap[transit.from_location_id] || "—"}</strong>
                    <span>→</span>
                    <strong>{locationMap[transit.to_location_id] || "—"}</strong>
                  </div>
                  <div className="transit-history-meta">
                    <span className={\`status-pill transit-progress-pill transit-progress-\${progressClass(transit.transit_progress)}\`}>{PROGRESS_LABEL[transit.transit_progress] || transit.transit_progress}</span>
                    <span>Sender: {transit.sender || "—"}</span>
                    <span>Carrier: {transit.carrier || "—"}</span>
                  </div>
                  {transit.sent_at && <p>Sent: {formatDate(transit.sent_at)}</p>}
                  {transit.received_at && <p>Received by {transit.receiver || "—"}: {formatDate(transit.received_at)}</p>}
                  {transit.note && <p><strong>Transit note:</strong> {transit.note}</p>}
                  {row.note && <p><strong>Item note:</strong> {row.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TransitCard({ transit, itemMap, locationMap, canEdit, onEdit, onStartMoving }) {
  const transitItems = transit.item_ids.map((id) => itemMap[id]).filter(Boolean);

  return (
    <article className={\`transit-box transit-box-\${progressClass(transit.transit_progress)}\`}>
      <div className="transit-box-header">
        <div>
          <p className="section-kicker">TRANSIT</p>
          <h3>{locationMap[transit.from_location_id] || "—"} <span>→</span> {locationMap[transit.to_location_id] || "—"}</h3>
          <p>Created {formatDate(transit.created_at)}</p>
        </div>
        <span className={\`transit-progress-badge transit-progress-\${progressClass(transit.transit_progress)}\`}>
          {PROGRESS_LABEL[transit.transit_progress] || transit.transit_progress}
        </span>
      </div>

      <div className="transit-box-grid">
        <div>
          <span className="transit-label">Sender</span>
          <strong>{transit.sender || "—"}</strong>
        </div>
        <div>
          <span className="transit-label">Carrier</span>
          <strong>{transit.carrier || "—"}</strong>
        </div>
        <div>
          <span className="transit-label">Sent date & time</span>
          <strong>{formatDate(transit.sent_at)}</strong>
        </div>
        {transit.receiver && (
          <div>
            <span className="transit-label">Receiver</span>
            <strong>{transit.receiver}</strong>
          </div>
        )}
        {transit.received_at && (
          <div>
            <span className="transit-label">Received date & time</span>
            <strong>{formatDate(transit.received_at)}</strong>
          </div>
        )}
      </div>

      <div className="transit-box-items">
        <div className="transit-field-heading">
          <div><strong>Items</strong><span>{transitItems.length} item{transitItems.length === 1 ? "" : "s"}</span></div>
        </div>
        <div className="transit-box-item-list">
          {transitItems.map((item) => (
            <button key={item.id} type="button" className="inline-machine-link" onClick={() => onEdit?.("item", item.id)}>
              {itemLabel(item)}
            </button>
          ))}
        </div>
      </div>

      {transit.note && (
        <div className="transit-box-note">
          <span className="transit-label">Transit note</span>
          <p>{transit.note}</p>
        </div>
      )}

      {canEdit && (
        <div className="transit-box-actions">
          {transit.transit_progress === PROGRESS.standby && (
            <>
              <button className="secondary-button" onClick={() => onEdit?.("edit", transit)}>Edit</button>
              <button className="primary-button" onClick={() => onStartMoving(transit)}>Start Moving</button>
            </>
          )}
          {transit.transit_progress === PROGRESS.moving && (
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

    const [itemsResult, locationsResult, transitResult, transitItemsResult] = await Promise.all([
      supabase.from("items").select("id,serial_number,item_type,current_location_id,inventory_status_id,inventory_statuses(name)").order("serial_number"),
      supabase.from("locations").select("id,name,is_active").order("name"),
      supabase.from("transits").select("id,from_location_id,to_location_id,sent_at,received_at,transit_progress,sender,receiver,carrier,note,created_by,created_at,updated_at").order("created_at", { ascending: false }),
      supabase.from("transit_items").select("id,transit_id,item_id,received_at,note,created_at,updated_at").order("created_at"),
    ]);

    const failed = [itemsResult, locationsResult, transitResult, transitItemsResult].find((result) => result.error);
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

  const filteredTransits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transits.filter((transit) => {
      const transitItems = transit.item_ids.map((id) => itemMap[id]).filter(Boolean);
      const matchesSearch = !query || [
        transit.sender,
        transit.carrier,
        transit.receiver,
        transit.note,
        locationMap[transit.from_location_id],
        locationMap[transit.to_location_id],
        transit.transit_progress,
        ...transitItems.flatMap((item) => [item.serial_number, item.item_type]),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));

      const matchesLocation = locationFilter === "all"
        || transit.from_location_id === locationFilter
        || transit.to_location_id === locationFilter;

      return matchesSearch && matchesLocation;
    });
  }, [transits, itemMap, locationMap, search, locationFilter]);

  const grouped = useMemo(() => ({
    [PROGRESS.moving]: filteredTransits.filter((x) => x.transit_progress === PROGRESS.moving),
    [PROGRESS.standby]: filteredTransits.filter((x) => x.transit_progress === PROGRESS.standby),
    [PROGRESS.completed]: filteredTransits.filter((x) => x.transit_progress === PROGRESS.completed),
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
      .update({
        transit_progress: PROGRESS.moving,
        sent_at: transit.sent_at || new Date().toISOString(),
      })
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
      <section className={\`transit-section transit-section-\${className}\`}>
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
          locations={locations}
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
