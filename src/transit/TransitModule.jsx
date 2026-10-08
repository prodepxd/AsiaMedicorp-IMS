import { useEffect, useMemo, useRef, useState } from "react";

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

function progressClass(progress) {
  return String(progress || "").replace(/[^a-z]+/g, "-");
}

async function loadInventoryStateMap(supabase, itemIds) {
  const ids = [...new Set((itemIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("item_inventory_state")
    .select("item_id,inventory_state")
    .in("item_id", ids);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row) => [row.item_id, row.inventory_state]));
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
  const [availableItems, setAvailableItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [toLocationId, setToLocationId] = useState(editRecord?.to_location_id || "");
  const [sender, setSender] = useState(editRecord?.sender || "");
  const [carrier, setCarrier] = useState(editRecord?.carrier || "");
  const [sentAt, setSentAt] = useState(
    editRecord?.sent_at ? localDateTimeValue(new Date(editRecord.sent_at)) : ""
  );
  const [receiver, setReceiver] = useState(editRecord?.receiver || "");
  const [receivedAt, setReceivedAt] = useState(
    editRecord?.received_at ? localDateTimeValue(new Date(editRecord.received_at)) : ""
  );
  const [note, setNote] = useState(editRecord?.note || "");
  const [itemSearch, setItemSearch] = useState("");
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const [machineComponents, setMachineComponents] = useState({});
  const [movingItemIds, setMovingItemIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const itemMap = useMemo(() => Object.fromEntries(availableItems.map((item) => [item.id, item])), [availableItems]);
  const movingItemIdSet = useMemo(() => new Set(movingItemIds), [movingItemIds]);

  useEffect(() => {
    let alive = true;
    async function loadItemsAtLocation() {
      setItemSearch("");
      if (!fromLocationId) { setSelectedItemIds([]); setAvailableItems([]); setMachineComponents({}); setMovingItemIds([]); return; }
      setItemsLoading(true);
      const { data, error: itemError } = await supabase.from("items").select("id,serial_number,item_type,current_location_id,inventory_status_id").eq("current_location_id", fromLocationId).order("serial_number");
      if (!alive) return;
      if (itemError) { setAvailableItems([]); setMachineComponents({}); setMovingItemIds([]); setError(itemError.message); setItemsLoading(false); return; }
      const statusIds = [...new Set((data || []).map((item) => item.inventory_status_id).filter(Boolean))];
      let statusMap = {};
      if (statusIds.length) {
        const { data: statuses, error: statusError } = await supabase.from("inventory_statuses").select("id,name").in("id", statusIds);
        if (!alive) return;
        if (statusError) { setAvailableItems([]); setMachineComponents({}); setMovingItemIds([]); setError(statusError.message); setItemsLoading(false); return; }
        statusMap = Object.fromEntries((statuses || []).map((status) => [status.id, status.name]));
      }
      let inventoryStateMap = {};
      try {
        inventoryStateMap = await loadInventoryStateMap(supabase, (data || []).map((item) => item.id));
      } catch (stateError) {
        if (!alive) return;
        setAvailableItems([]);
        setMachineComponents({});
        setMovingItemIds([]);
        setError(stateError.message || "We could not load derived inventory state.");
        setItemsLoading(false);
        return;
      }
      const rows = (data || []).map((item) => ({
        ...item,
        inventory_status_name: statusMap[item.inventory_status_id] || "—",
        inventory_state: inventoryStateMap[item.id] || null,
      }));
      setAvailableItems(rows);
      const machineIds = rows.filter((item) => item.item_type === "Machine").map((item) => item.id);
      let componentRows = [];
      if (machineIds.length) {
        const { data: components, error: componentError } = await supabase.from("machine_components").select("machine_item_id,component_item_id").in("machine_item_id", machineIds);
        if (!alive) return;
        if (componentError) { setError(componentError.message); setMachineComponents({}); setMovingItemIds([]); setItemsLoading(false); return; }
        componentRows = components || [];
        const map = {};
        componentRows.forEach((row) => {
          if (!map[row.machine_item_id]) map[row.machine_item_id] = [];
          if (!map[row.machine_item_id].includes(row.component_item_id)) map[row.machine_item_id].push(row.component_item_id);
        });
        setMachineComponents(map);
      } else {
        setMachineComponents({});
      }
      const movingCandidateIds = [...new Set([...rows.map((item) => item.id), ...componentRows.map((row) => row.component_item_id)])];
      if (movingCandidateIds.length) {
        const { data: activeTransitItems, error: movingItemError } = await supabase.from("transit_items").select("item_id,transit_id").in("item_id", movingCandidateIds);
        if (!alive) return;
        if (movingItemError) { setError(movingItemError.message); setMovingItemIds([]); setItemsLoading(false); return; }
        const transitIds = [...new Set((activeTransitItems || []).map((row) => row.transit_id).filter(Boolean))];
        if (transitIds.length) {
          const { data: movingTransits, error: movingTransitError } = await supabase.from("transits").select("id").in("id", transitIds).eq("transit_progress", PROGRESS.moving);
          if (!alive) return;
          if (movingTransitError) { setError(movingTransitError.message); setMovingItemIds([]); setItemsLoading(false); return; }
          const movingTransitIdSet = new Set((movingTransits || []).map((transit) => transit.id));
          setMovingItemIds((activeTransitItems || []).filter((row) => movingTransitIdSet.has(row.transit_id)).map((row) => row.item_id));
        } else {
          setMovingItemIds([]);
        }
      } else {
        setMovingItemIds([]);
      }
      setItemsLoading(false);
    }
    loadItemsAtLocation();
    return () => { alive = false; };
  }, [supabase, fromLocationId]);

  const selectedDisplayItems = useMemo(
    () => selectedItemIds.map((id) => itemMap[id]).filter(Boolean),
    [selectedItemIds, itemMap]
  );

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!fromLocationId) return [];
    return availableItems.filter((item) => !query || itemLabel(item).toLowerCase().includes(query));
  }, [availableItems, fromLocationId, itemSearch]);

  function itemIsMoving(itemId) { return movingItemIdSet.has(itemId); }

  function machineIsBlocked(machineId) {
    return itemIsMoving(machineId) || (machineComponents[machineId] || []).some((childId) => itemIsMoving(childId));
  }

  function toggleItem(itemId) {
    if (itemIsMoving(itemId) || machineIsBlocked(itemId)) {
      setError("This item is currently moving and cannot be added to another Transit.");
      return;
    }
    setSelectedItemIds((current) => {
      const item = itemMap[itemId];
      if (!item) return current;
      const parentMachineIds = Object.entries(machineComponents)
        .filter(([, componentIds]) => componentIds.includes(itemId))
        .map(([machineId]) => machineId);
      if (parentMachineIds.length > 0) {
        if (parentMachineIds.some((machineId) => current.includes(machineId))) setError("Installed components are included automatically with their Machine and cannot be deselected.");
        else setError("This component is installed in a Machine. Select the parent Machine.");
        return current;
      }
      if (current.includes(itemId)) {
        const childIds = new Set(machineComponents[itemId] || []);
        return current.filter((id) => id !== itemId && !childIds.has(id));
      }
      return [...new Set([...current, itemId, ...(machineComponents[itemId] || [])])];
    });
  }

  const selectedSummary = useMemo(() => {
    const selected = new Set(selectedItemIds);
    return availableItems.filter((item) => selected.has(item.id));
  }, [availableItems, selectedItemIds]);

  const componentParentMap = useMemo(() => {
    const map = {};
    Object.entries(machineComponents).forEach(([machineId, componentIds]) => componentIds.forEach((componentId) => {
      if (!map[componentId]) map[componentId] = [];
      map[componentId].push(machineId);
    }));
    return map;
  }, [machineComponents]);

  const itemRows = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!fromLocationId) return [];
    const matches = (item) => !query || itemLabel(item).toLowerCase().includes(query);
    return availableItems
      .filter((item) => !componentParentMap[item.id]?.length)
      .filter((item) => {
        if (matches(item)) return true;
        return item.item_type === "Machine" && (machineComponents[item.id] || []).some((childId) => matches(itemMap[childId]));
      })
      .sort((a, b) => Number(machineIsBlocked(a.id)) - Number(machineIsBlocked(b.id)));
  }, [availableItems, fromLocationId, itemSearch, componentParentMap, machineComponents, itemMap, movingItemIdSet]);

  function machineChildren(machineId) {
    const selected = new Set(selectedItemIds);
    const query = itemSearch.trim().toLowerCase();
    return (machineComponents[machineId] || []).map((id) => itemMap[id]).filter(Boolean).filter((item) => !query || itemLabel(item).toLowerCase().includes(query) || selected.has(item.id));
  }

  async function save(event) {
    event.preventDefault();
    setError("");

    if (!fromLocationId) return setError("Select the source location first.");
    if (selectedItemIds.length === 0) return setError("Select at least one Global Stock item from the selected source location.");
    if (!toLocationId) return setError("To location is required.");
    if (fromLocationId === toLocationId) return setError("From and To locations must be different.");
    if (!sender.trim()) return setError("Sender is required.");
    if (!carrier.trim()) return setError("Carrier is required.");
    if (mode === "complete" && !sentAt) return setError("Sent date/time is required to complete the Transit.");
    if (mode === "complete" && (!receiver.trim() || !receivedAt)) {
      return setError("Receiver and received date/time are required to complete the Transit.");
    }

    if (mode !== "complete") {
      const { data: activeRows, error: activeRowsError } = await supabase.from("transit_items").select("item_id,transit_id").in("item_id", selectedItemIds);
      if (activeRowsError) return setError(activeRowsError.message);
      const transitIds = [...new Set((activeRows || []).map((row) => row.transit_id).filter(Boolean))];
      if (transitIds.length) {
        const { data: movingTransits, error: movingError } = await supabase.from("transits").select("id").in("id", transitIds).eq("transit_progress", PROGRESS.moving);
        if (movingError) return setError(movingError.message);
        const movingTransitIds = new Set((movingTransits || []).map((transit) => transit.id));
        const blockedIds = (activeRows || []).filter((row) => movingTransitIds.has(row.transit_id)).map((row) => row.item_id);
        if (blockedIds.length) return setError("One or more selected items are currently moving and cannot be added to another Transit.");
      }
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

        const { error: locationUpdateError } = await supabase
          .from("items")
          .update({ current_location_id: toLocationId })
          .in("id", selectedItemIds);
        if (locationUpdateError) throw locationUpdateError;
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
                : "A Transit can contain one or more Global Stock items. Select the starting location first, then choose the items to move."}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="transit-form" onSubmit={save}>
          <div className="transit-form-grid transit-location-grid">
              <label className="redesign-field">
                <span>From location *</span>
                <select value={fromLocationId} disabled={mode === "complete"} onChange={(event) => { setFromLocationId(event.target.value); setSelectedItemIds([]); setError(""); }} required>
                  <option value="">Select starting location first</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
              <label className="redesign-field">
                <span>To location *</span>
                <select value={toLocationId} disabled={mode === "complete"} onChange={(event) => setToLocationId(event.target.value)} required>
                  <option value="">Select destination</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
          </div>

          {mode !== "complete" && (
            <div className="transit-item-picker">
              <div className="transit-field-heading">
                <div><strong>Global Stock items *</strong><span>Search by serial number and select one or more items.</span></div>
                <span className="history-count">{selectedItemIds.length} selected</span>
              </div>
              <div className={itemDropdownOpen ? "transit-item-dropdown open" : "transit-item-dropdown"}>
                <button type="button" className="transit-item-dropdown-trigger" onClick={() => setItemDropdownOpen((open) => !open)} disabled={!fromLocationId || itemsLoading}>
                  <span>{!fromLocationId ? "Select a starting location first" : itemsLoading ? "Loading Global Stock..." : selectedSummary.length ? (selectedSummary.filter((item) => item.item_type === "Machine").length + " machine" + (selectedSummary.filter((item) => item.item_type === "Machine").length === 1 ? "" : "s") + " · " + selectedItemIds.length + " items selected") : "Select Global Stock items"}</span>
                  <span className="transit-item-dropdown-chevron">▾</span>
                </button>
                {itemDropdownOpen && fromLocationId && !itemsLoading && (
                  <div className="transit-item-dropdown-menu">
                    <input autoFocus value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Search by serial number" />
                    <div className="transit-item-checklist">
                      {itemRows.length === 0 ? <div className="history-empty">No Global Stock items match this search.</div> : itemRows.map((item) => {
                        const checked = selectedItemIds.includes(item.id);
                        const children = item.item_type === "Machine" ? machineChildren(item.id) : [];
                        const itemBlocked = machineIsBlocked(item.id);
                        const itemTitle = itemBlocked ? (itemIsMoving(item.id) ? "This item is currently moving." : "This Machine cannot be selected because an installed component is currently moving.") : undefined;
                        return (
                          <div className="transit-item-tree" key={item.id}>
                            <label className={(checked ? "transit-item-option selected" : "transit-item-option") + (itemBlocked ? " moving" : "")} title={itemTitle}>
                              <input type="checkbox" checked={checked} disabled={itemBlocked} onChange={() => toggleItem(item.id)} />
                              <span><strong>{itemLabel(item)}</strong><small>{itemBlocked ? (itemIsMoving(item.id) ? "Currently moving" : "Installed component currently moving") : (item.inventory_state || item.inventory_status_name || "—")}{children.length > 0 ? " · Includes " + children.length + " installed component" + (children.length === 1 ? "" : "s") : ""}</small></span>
                            </label>
                            {children.length > 0 && <div className="transit-component-list">{children.map((child) => {
                              const childMoving = itemIsMoving(child.id);
                              return (
                                <div className={(selectedItemIds.includes(child.id) ? "transit-component-row selected" : "transit-component-row") + (childMoving ? " moving" : "")} key={child.id} title={childMoving ? "This item is currently moving." : undefined}>
                                  <input type="checkbox" checked={selectedItemIds.includes(child.id)} disabled readOnly />
                                  <span><strong>{itemLabel(child)}</strong><small>{childMoving ? "Currently moving" : (child.inventory_state || child.inventory_status_name || "—")}</small></span>
                                </div>
                              );
                            })}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {selectedSummary.length > 0 && (
                <div className="transit-selected-items">
                  <div className="transit-field-heading">
                    <div><strong>Selected items</strong><span>These items will be included in the Transit.</span></div>
                  </div>
                  <div className="transit-selected-tree">
                    {selectedSummary.filter((item) => !componentParentMap[item.id]?.length).map((item) => (
                      <div className="transit-selected-tree-item" key={item.id}>
                        <div className="transit-selected-main">
                          <input
                            type="checkbox"
                            className="transit-selected-checkbox"
                            checked
                            onChange={() => toggleItem(item.id)}
                            aria-label={`Remove ${itemLabel(item)} from selected Transit items`}
                          />
                          <div>
                            <strong>{itemLabel(item)}</strong>
                            <small>{item.inventory_state || item.inventory_status_name || "—"}</small>
                          </div>
                        </div>
                        {item.item_type === "Machine" && machineChildren(item.id).length > 0 && (
                          <div className="transit-selected-components">
                            {machineChildren(item.id).map((child) => (
                              <div className="transit-selected-component" key={child.id}>
                                <input
                                  type="checkbox"
                                  className="transit-selected-checkbox"
                                  checked
                                  disabled
                                  readOnly
                                  aria-label={`${itemLabel(child)} is included automatically`}
                                />
                                <div>
                                  <strong>{itemLabel(child)}</strong>
                                  <small>{child.inventory_state || child.inventory_status_name || "—"} · Included automatically</small>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="transit-details-grid">
            <div className="transit-details-row transit-two-col">
              <label className="redesign-field">
                <span>Sender *</span>
                <input value={sender} onChange={(event) => setSender(event.target.value)} placeholder="Sender" required />
              </label>
              <label className="redesign-field">
                <span>Receiver{mode === "complete" ? " *" : ""}</span>
                <input value={receiver} onChange={(event) => setReceiver(event.target.value)} placeholder={mode === "complete" ? "Receiver" : "Optional until completion"} required={mode === "complete"} />
              </label>
            </div>

            <div className="transit-details-row transit-two-col">
              <label className="redesign-field">
                <span>Sent date & time{mode === "complete" ? " *" : ""}</span>
                <input type="datetime-local" value={sentAt} onChange={(event) => setSentAt(event.target.value)} required={mode === "complete"} />
              </label>
              <label className="redesign-field">
                <span>Received date & time{mode === "complete" ? " *" : ""}</span>
                <input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required={mode === "complete"} />
              </label>
            </div>

            <div className="transit-details-row transit-two-col">
              <label className="redesign-field">
                <span>Carrier *</span>
                <input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Carrier" required />
              </label>
              <label className="redesign-field">
                <span>Transit note <em>· Optional</em></span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows="4" placeholder="Optional note for the overall Transit" />
              </label>
            </div>
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

export function ItemTransitHistory({ supabase, itemId, canEdit, focusLatestMoving = 0 }) {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNoteId, setSavingNoteId] = useState(null);
  const historyRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function loadHistory() {
      setLoading(true);
      setError("");

      const { data, error: historyError } = await supabase
        .from("transit_items")
        .select("id,received_at,note,created_at,transit_id,transits(id,from_location_id,to_location_id,sent_at,received_at,transit_progress,sender,receiver,carrier,created_at)")
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

  useEffect(() => {
    if (!focusLatestMoving || loading || error || rows.length === 0) return;
    const target = historyRef.current?.querySelector(".transit-history-row-moving");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusLatestMoving, loading, error, rows]);

  const locationMap = useMemo(() => Object.fromEntries(locations.map((row) => [row.id, row.name])), [locations]);

  return (
    <div className="item-transit-history" ref={historyRef}>
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
              <div className={"transit-history-row" + (transit.transit_progress === PROGRESS.moving ? " transit-history-row-moving" : "")} key={row.id}>
                <div className="transit-history-details">
                  <div className="transit-history-field">
                    <span>Sent</span>
                    <strong>{formatDate(transit.sent_at)}</strong>
                  </div>
                  <div className="transit-history-field">
                    <span>Received</span>
                    <strong>{formatDate(row.received_at)}</strong>
                  </div>
                  <div className="transit-history-created">
                    <span>Created</span>
                    <strong>{formatDate(transit.created_at)}</strong>
                  </div>
                </div>

                <div className="transit-history-movement">
                  <div className="transit-history-horizontal-route" aria-label={`Movement from ${locationMap[transit.from_location_id] || "unknown location"} to ${locationMap[transit.to_location_id] || "unknown location"}`}>
                    <div className="transit-history-location transit-history-location-from">
                      <span>FROM</span>
                      <strong>
                        {(() => {
                          const value = locationMap[transit.from_location_id] || "—";
                          const bracketIndex = value.indexOf("(");
                          return bracketIndex > 0 ? <>{value.slice(0, bracketIndex).trim()}<br />{value.slice(bracketIndex).trim()}</> : value;
                        })()}
                      </strong>
                    </div>
                    <div className="transit-history-route-arrow" aria-hidden="true">→</div>
                    <div className="transit-history-location transit-history-location-to">
                      <span>TO</span>
                      <strong>
                        {(() => {
                          const value = locationMap[transit.to_location_id] || "—";
                          const bracketIndex = value.indexOf("(");
                          return bracketIndex > 0 ? <>{value.slice(0, bracketIndex).trim()}<br />{value.slice(bracketIndex).trim()}</> : value;
                        })()}
                      </strong>
                    </div>
                  </div>
                  <div className="transit-history-movement-meta">
                    <div className="transit-history-progress">
                      <span className={`status-pill transit-progress-pill transit-progress-${progressClass(transit.transit_progress)}`}>{PROGRESS_LABEL[transit.transit_progress] || transit.transit_progress}</span>
                    </div>
                    <div className="transit-history-note">
                      <div className="transit-history-section-heading">
                        <span>Note</span>
                        {canEdit && editingNoteId !== row.id && (
                          <button type="button" className="inline-edit-button" onClick={() => { setEditingNoteId(row.id); setNoteDraft(row.note || ""); setError(""); }}>
                            {row.note ? "Edit" : "Add"}
                          </button>
                        )}
                      </div>
                      {editingNoteId === row.id ? (
                        <div className="transit-history-note-editor">
                          <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows="3" placeholder="Add a note for this item..." />
                          <div className="transit-history-note-actions">
                            <button type="button" className="secondary-button" onClick={() => { setEditingNoteId(null); setNoteDraft(""); }} disabled={savingNoteId === row.id}>Cancel</button>
                            <button type="button" className="primary-button" onClick={async () => {
                              setSavingNoteId(row.id);
                              setError("");
                              const { error: noteError } = await supabase.from("transit_items").update({ note: noteDraft.trim() || null }).eq("id", row.id);
                              if (noteError) {
                                setError(noteError.message);
                              } else {
                                setRows((current) => current.map((item) => item.id === row.id ? { ...item, note: noteDraft.trim() || null } : item));
                                setEditingNoteId(null);
                                setNoteDraft("");
                              }
                              setSavingNoteId(null);
                            }} disabled={savingNoteId === row.id}>{savingNoteId === row.id ? "Saving..." : "Save"}</button>
                          </div>
                        </div>
                      ) : (
                        <p>{row.note || "No item note."}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="transit-history-people">
                  <div className="transit-history-field">
                    <span>Sender</span>
                    <strong>{transit.sender || "—"}</strong>
                  </div>
                  <div className="transit-history-field">
                    <span>Carrier</span>
                    <strong>{transit.carrier || "—"}</strong>
                  </div>
                  <div className="transit-history-field">
                    <span>Receiver</span>
                    <strong>{transit.receiver || "—"}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TransitCard({ transit, itemMap, locationMap, canEdit, canDelete, onEdit, onStartMoving, onCancel, onDelete }) {
  const transitItems = transit.item_ids.map((id) => itemMap[id]).filter(Boolean);

  return (
    <article className={`transit-box transit-box-${progressClass(transit.transit_progress)}`}>
      <div className="transit-box-header">
        <div>
          <p className="section-kicker">TRANSIT</p>
          <h3>{locationMap[transit.from_location_id] || "—"} <span>→</span> {locationMap[transit.to_location_id] || "—"}</h3>
          <p>Created {formatDate(transit.created_at)}</p>
        </div>
        <span className={`transit-progress-badge transit-progress-${progressClass(transit.transit_progress)}`}>
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

      {(canEdit || canDelete) && (
        <div className="transit-box-actions">
          {canEdit && transit.transit_progress === PROGRESS.standby && (
            <>
              <button className="secondary-button" onClick={() => onEdit?.("edit", transit)}>Edit</button>
              <button className="primary-button" onClick={() => onStartMoving(transit)}>Start Moving</button>
            </>
          )}
          {canEdit && transit.transit_progress === PROGRESS.moving && (
            <button className="primary-button" onClick={() => onEdit?.("complete", transit)}>Receive & Complete</button>
          )}
          {canDelete && transit.transit_progress !== PROGRESS.completed && (
            <button className="danger-button" onClick={() => onCancel?.(transit)}>Cancel Transit</button>
          )}
          {canDelete && transit.transit_progress === PROGRESS.completed && (
            <button className="danger-button" onClick={() => onDelete?.(transit)}>Delete Transit</button>
          )}
        </div>
      )}
    </article>
  );
}

export default function TransitModule({ supabase, canEdit, canDelete, onItemClick, view = "active" }) {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventoryStatuses, setInventoryStatuses] = useState([]);
  const [transits, setTransits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [startingLocationFilter, setStartingLocationFilter] = useState("all");
  const [destinationLocationFilter, setDestinationLocationFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState("edit");
  const [editingTransit, setEditingTransit] = useState(null);
  const [editingItemIds, setEditingItemIds] = useState([]);
  const [pastVisible, setPastVisible] = useState(15);
  const pastLoadRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");

    const [itemsResult, locationsResult, transitResult, transitItemsResult, statusResult] = await Promise.all([
      // Keep the item query independent of PostgREST's inventory-status relationship.
      // Transit eligibility depends on current_location_id, not on the status join.
      supabase.from("items").select("id,serial_number,item_type,current_location_id,inventory_status_id").order("serial_number"),
      supabase.from("locations").select("id,name,is_active").order("name"),
      supabase.from("transits").select("id,from_location_id,to_location_id,sent_at,received_at,transit_progress,sender,receiver,carrier,note,created_by,created_at,updated_at").order("created_at", { ascending: false }),
      supabase.from("transit_items").select("id,transit_id,item_id,received_at,note,created_at,updated_at").order("created_at"),
      supabase.from("inventory_statuses").select("id,name"),
    ]);

    // Status names are display-only. Do not let a status lookup failure hide Global Stock items.
    const failed = [itemsResult, locationsResult, transitResult, transitItemsResult].find((result) => result.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    const statusMap = Object.fromEntries((statusResult.data || []).map((status) => [status.id, status.name]));
    let inventoryStateMap = {};
    try {
      inventoryStateMap = await loadInventoryStateMap(supabase, (itemsResult.data || []).map((item) => item.id));
    } catch (stateError) {
      setError(stateError.message || "We could not load derived inventory state.");
      setLoading(false);
      return;
    }
    const itemRows = (itemsResult.data || []).map((item) => ({
      ...item,
      inventory_status_name: statusMap[item.inventory_status_id] || "—",
      inventory_state: inventoryStateMap[item.id] || null,
    }));

    const itemMap = Object.fromEntries(itemRows.map((item) => [item.id, item]));
    const itemIdsByTransit = {};
    (transitItemsResult.data || []).forEach((row) => {
      if (!itemIdsByTransit[row.transit_id]) itemIdsByTransit[row.transit_id] = [];
      itemIdsByTransit[row.transit_id].push(row.item_id);
    });

    setItems(itemRows);
    setLocations((locationsResult.data || []).filter((row) => row.is_active !== false));
    setInventoryStatuses(statusResult.data || []);
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

      const matchesStartingLocation = startingLocationFilter === "all"
        || transit.from_location_id === startingLocationFilter;
      const matchesDestinationLocation = destinationLocationFilter === "all"
        || transit.to_location_id === destinationLocationFilter;

      return matchesSearch && matchesStartingLocation && matchesDestinationLocation;
    });
  }, [transits, itemMap, locationMap, search, startingLocationFilter, destinationLocationFilter]);

  const grouped = useMemo(() => ({
    [PROGRESS.moving]: filteredTransits.filter((x) => x.transit_progress === PROGRESS.moving),
    [PROGRESS.standby]: filteredTransits.filter((x) => x.transit_progress === PROGRESS.standby),
    [PROGRESS.completed]: filteredTransits.filter((x) => x.transit_progress === PROGRESS.completed),
  }), [filteredTransits]);

  const activeTransits = useMemo(
    () => [...grouped[PROGRESS.moving], ...grouped[PROGRESS.standby]],
    [grouped]
  );
  const pastTransits = grouped[PROGRESS.completed];

  useEffect(() => {
    setPastVisible(15);
  }, [search, startingLocationFilter, destinationLocationFilter, view]);

  useEffect(() => {
    if (view !== "past" || pastVisible >= pastTransits.length || !pastLoadRef.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setPastVisible((value) => Math.min(value + 9, pastTransits.length));
      }
    }, { rootMargin: "0px 0px 240px 0px" });
    observer.observe(pastLoadRef.current);
    return () => observer.disconnect();
  }, [view, pastVisible, pastTransits.length]);

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

  async function deleteTransit(transit) {
    setError("");
    const isCompleted = transit.transit_progress === PROGRESS.completed;
    const confirmed = window.confirm(
      isCompleted
        ? "Delete this completed Transit? Its Transit history entries for the included items will also be removed."
        : "Cancel this Transit? The Transit and its item history entries will be removed."
    );
    if (!confirmed) return;

    const { error: deleteError } = await supabase
      .from("transits")
      .delete()
      .eq("id", transit.id);

    if (deleteError) {
      setError(deleteError.message);
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

  function renderSection(title, key, className, list, limit = list.length) {
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
          <div className={className === "moving" || className === "standby" ? "transit-box-list transit-box-carousel" : "transit-box-list"}>
            {list.slice(0, limit).map((transit) => (
              <TransitCard
                key={transit.id}
                transit={transit}
                itemMap={itemMap}
                locationMap={locationMap}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={(action, value) => {
                  if (action === "item") onItemClick?.(value);
                  else if (action === "complete") openComplete(value);
                  else openEdit(value);
                }}
                onStartMoving={startMoving}
                onCancel={deleteTransit}
                onDelete={deleteTransit}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="content-card transit-page">
      <div className="section-heading transit-header">
        <div>
          <p className="section-kicker">TRANSIT</p>
          <h2>{view === "past" ? "Past Transits" : "Active Transits"}</h2>
          <p>Move one or more Global Stock items between locations.</p>
        </div>
        <div className="transit-header-actions">
          <button className="secondary-button" onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
          {canEdit && view === "active" && <button className="primary-button" onClick={openCreate}>+ Create Transit</button>}
        </div>
      </div>

      <div className="stock-filters transit-filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, sender, carrier, location..." />
        <select value={startingLocationFilter} onChange={(event) => setStartingLocationFilter(event.target.value)}>
          <option value="all">All starting locations</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
        <select value={destinationLocationFilter} onChange={(event) => setDestinationLocationFilter(event.target.value)}>
          <option value="all">All destination locations</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </div>

      {error && <div className="error-message stock-error">{error}</div>}

      {loading ? (
        <div className="history-empty">Loading Transits...</div>
      ) : (
        <div className="transit-sections">
          {view === "active" ? (
            <>
              {renderSection("Moving", PROGRESS.moving, "moving", grouped[PROGRESS.moving])}
              {renderSection("Stand-By", PROGRESS.standby, "standby", grouped[PROGRESS.standby])}
            </>
          ) : (
            <>
              {renderSection("Completed", PROGRESS.completed, "completed", pastTransits, pastVisible)}
              {pastVisible < pastTransits.length && <div ref={pastLoadRef} className="transit-infinite-sentinel" aria-hidden="true" />}
            </>
          )}
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

