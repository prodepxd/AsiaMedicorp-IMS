import { useEffect, useMemo, useState } from "react";

const ITEM_TYPES = [
  "Machine",
  "Probe",
  "Board",
  "PSU",
  "Monitor",
  "EMI Filter",
  "Hard Disk",
  "Keyboard",
];

const TYPE_CONFIG = {
  Machine: ["manufacturer", "model", "manufacturer_year", "monitor_size", "software_version", "functions", "portable", "connectors"],
  Probe: ["manufacturer", "model", "probe_type", "year"],
  Board: ["machine_model", "board_type", "part_number", "version_number", "repaired"],
  PSU: ["machine_model"],
  Monitor: ["machine_model", "monitor_size", "video_input"],
  "EMI Filter": ["emi_type"],
  "Hard Disk": ["manufacturer", "capacity_gb", "size_inches", "hard_disk_type", "machine_model", "software_version"],
  Keyboard: ["machine_model"],
};

const FIELD_LABELS = {
  manufacturer: "Manufacturer",
  model: "Model",
  manufacturer_year: "Manufacturer year",
  monitor_size: "Monitor size",
  software_version: "Software version",
  functions: "Functions",
  portable: "Portable",
  connectors: "Number of connectors",
  probe_type: "Probe type",
  year: "Year",
  machine_model: "Works with which machine",
  board_type: "Board type",
  part_number: "Part number",
  version_number: "Version number",
  repaired: "Repaired",
  video_input: "Video input",
  emi_type: "Filter type",
  capacity_gb: "Capacity (GB)",
  size_inches: "Size (inches)",
  hard_disk_type: "Hard disk type",
};

const MASTER_GROUPS = [
  { key: "equipment_manufacturers", label: "Manufacturer List 1", table: "equipment_manufacturers" },
  { key: "machine_models", label: "Machine Models", table: "machine_models", manufacturer: true },
  { key: "probe_types", label: "Probe Types", table: "probe_types" },
  { key: "probe_models", label: "Probe Models", table: "probe_models", manufacturer: true },
  { key: "hard_disk_manufacturers", label: "Hard Disk Manufacturers", table: "hard_disk_manufacturers" },
  { key: "board_types", label: "Board Types", table: "board_types" },
  { key: "locations", label: "Locations", table: "locations" },
  { key: "statuses", label: "Statuses", table: "statuses" },
  { key: "quality_statuses", label: "Quality Statuses", table: "quality_statuses" },
  { key: "transit_statuses", label: "Transit Statuses", table: "transit_statuses" },
  { key: "suppliers", label: "Suppliers", table: "suppliers" },
  { key: "customers", label: "Customers", table: "customers" },
];

const SELECT_OPTIONS = {
  monitor_size: ["15", "17", "19", "21", "23"],
  portable: ["Yes", "No"],
  connectors: ["1", "2", "3", "4", "5"],
  video_input: ["VGA", "HDMI"],
  repaired: ["Yes", "No"],
  emi_type: ["Wired", "Board"],
  hard_disk_type: ["IDE", "SATA", "SSD"],
};

function emptyForm() {
  return {
    serial_number: "",
    status_id: "",
    quality_status_id: "",
    current_location_id: "",
    quality_note: "",
    manufacturer_id: "",
    model_id: "",
    manufacturer_year: "",
    monitor_size: "",
    software_version: "",
    functions: [],
    portable: "",
    connectors: "",
    probe_type_id: "",
    year: "",
    machine_model_id: "",
    board_type_id: "",
    part_number: "",
    version_number: "",
    repaired: "",
    video_input: "",
    emi_type: "",
    capacity_gb: "",
    size_inches: "",
    hard_disk_type: "",
  };
}

function Field({ label, children, required = false }) {
  return (
    <label className="redesign-field">
      <span>{label}{required ? " *" : ""}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options, placeholder = "Select", disabled = false, required = false }) {
  return (
    <select value={value || ""} onChange={onChange} disabled={disabled} required={required}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value ?? option} value={option.value ?? option}>
          {option.label ?? option}
        </option>
      ))}
    </select>
  );
}

function ItemForm({ supabase, type, onClose, onSaved }) {
  const [masters, setMasters] = useState({
    equipmentManufacturers: [],
    hardDiskManufacturers: [],
    machineModels: [],
    probeModels: [],
    probeTypes: [],
    boardTypes: [],
    locations: [],
    statuses: [],
    qualities: [],
  });
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const requests = [
        supabase.from("equipment_manufacturers").select("id,name").order("name"),
        supabase.from("hard_disk_manufacturers").select("id,name").order("name"),
        supabase.from("machine_models").select("id,name,manufacturer_id").order("name"),
        supabase.from("probe_models").select("id,name,manufacturer_id").order("name"),
        supabase.from("probe_types").select("id,name").order("name"),
        supabase.from("board_types").select("id,name").order("name"),
        supabase.from("locations").select("id,name").eq("is_active", true).order("name"),
        supabase.from("statuses").select("id,name").eq("is_active", true).order("name"),
        supabase.from("quality_statuses").select("id,name").eq("is_active", true).order("name"),
      ];
      const results = await Promise.all(requests);
      const failed = results.find((r) => r.error);
      if (!alive) return;
      if (failed) {
        setError(failed.error.message);
        setLoading(false);
        return;
      }
      const values = results.map((r) => r.data || []);
      setMasters({
        equipmentManufacturers: values[0],
        hardDiskManufacturers: values[1],
        machineModels: values[2],
        probeModels: values[3],
        probeTypes: values[4],
        boardTypes: values[5],
        locations: values[6],
        statuses: values[7],
        qualities: values[8],
      });
      const stock = values[7].find((x) => x.name === "In Stock");
      const good = values[8].find((x) => x.name === "Good");
      setForm((current) => ({ ...current, status_id: stock?.id || "", quality_status_id: good?.id || "" }));
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [supabase]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const machineModels = masters.machineModels.filter(
    (m) => !form.manufacturer_id || m.manufacturer_id === form.manufacturer_id
  );
  const probeModels = masters.probeModels.filter(
    (m) => !form.manufacturer_id || m.manufacturer_id === form.manufacturer_id
  );

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const common = {
      serial_number: form.serial_number.trim() || null,
      item_type: type,
      status_id: form.status_id,
      quality_status_id: form.quality_status_id,
      quality_note: form.quality_note.trim() || null,
      current_location_id: form.current_location_id || null,
    };

    let details;
    if (type === "Machine") details = {
      manufacturer_id: form.manufacturer_id,
      model_id: form.model_id,
      manufacturer_year: form.manufacturer_year ? Number(form.manufacturer_year) : null,
      monitor_size: form.monitor_size ? Number(form.monitor_size) : null,
      software_version: form.software_version.trim() || null,
      functions: form.functions,
      portable: form.portable === "Yes" ? true : form.portable === "No" ? false : null,
      connector_count: form.connectors ? Number(form.connectors) : null,
    };
    if (type === "Probe") details = {
      manufacturer_id: form.manufacturer_id,
      model_id: form.model_id,
      probe_type_id: form.probe_type_id,
      year: form.year ? Number(form.year) : null,
    };
    if (type === "Board") details = {
      compatible_machine_model_id: form.machine_model_id,
      board_type_id: form.board_type_id,
      part_number: form.part_number.trim() || null,
      version_number: form.version_number.trim() || null,
      repaired: form.repaired === "Yes" ? true : form.repaired === "No" ? false : null,
    };
    if (type === "PSU") details = { compatible_machine_model_id: form.machine_model_id };
    if (type === "Monitor") details = {
      compatible_machine_model_id: form.machine_model_id,
      size: form.monitor_size ? Number(form.monitor_size) : null,
      video_input: form.video_input || null,
    };
    if (type === "EMI Filter") details = { filter_type: form.emi_type };
    if (type === "Hard Disk") details = {
      manufacturer_id: form.manufacturer_id,
      capacity_gb: form.capacity_gb ? Number(form.capacity_gb) : null,
      size_inches: form.size_inches ? Number(form.size_inches) : null,
      disk_type: form.hard_disk_type,
      compatible_compatible_machine_model_id: form.machine_model_id || null,
      software_version: form.software_version.trim() || null,
    };
    if (type === "Keyboard") details = { compatible_machine_model_id: form.machine_model_id };

    if (!details) {
      setError("Unable to prepare item details.");
      setSaving(false);
      return;
    }

    const { data: item, error: itemError } = await supabase.from("items").insert(common).select("id").single();
    if (itemError) {
      setError(itemError.message);
      setSaving(false);
      return;
    }

    const table = {
      Machine: "machine_details",
      Probe: "probe_details",
      Board: "board_details",
      PSU: "psu_details",
      Monitor: "monitor_details",
      "EMI Filter": "emi_filter_details",
      "Hard Disk": "hard_disk_details",
      Keyboard: "keyboard_details",
    }[type];

    const { error: detailError } = await supabase.from(table).insert({ item_id: item.id, ...details });
    if (detailError) {
      await supabase.from("items").delete().eq("id", item.id);
      setError(detailError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
  }

  const field = (name) => {
    const commonProps = { value: form[name], onChange: (e) => set(name, e.target.value) };
    if (SELECT_OPTIONS[name]) return <Select {...commonProps} options={SELECT_OPTIONS[name]} required={["monitor_size","portable","connectors","video_input","repaired","emi_type","hard_disk_type"].includes(name)} />;
    return <input {...commonProps} />;
  };

  function specificFields() {
    if (type === "Machine") return (
      <>
        <Field label="Manufacturer" required><Select value={form.manufacturer_id} onChange={(e) => { set("manufacturer_id", e.target.value); set("model_id", ""); }} options={masters.equipmentManufacturers.map(x => ({ value:x.id, label:x.name }))} required /></Field>
        <Field label="Model" required><Select value={form.model_id} onChange={(e) => set("model_id", e.target.value)} options={machineModels.map(x => ({ value:x.id, label:x.name }))} placeholder={form.manufacturer_id ? "Select model" : "Select manufacturer first"} disabled={!form.manufacturer_id} required /></Field>
        <Field label="Manufacturer year" required><input type="number" min="1900" max="2100" value={form.manufacturer_year} onChange={(e)=>set("manufacturer_year",e.target.value)} required /></Field>
        <Field label="Monitor size" required>{field("monitor_size")}</Field>
        <Field label="Software version"><input value={form.software_version} onChange={(e)=>set("software_version",e.target.value)} /></Field>
        <Field label="Portable" required>{field("portable")}</Field>
        <Field label="Number of connectors" required>{field("connectors")}</Field>
        <div className="redesign-field"><span>Functions</span><div className="redesign-checks">{["4D","Cardiac","Elastography"].map(x=><label key={x}><input type="checkbox" checked={form.functions.includes(x)} onChange={(e)=>set("functions",e.target.checked?[...form.functions,x]:form.functions.filter(v=>v!==x))}/>{x}</label>)}</div></div>
      </>
    );
    if (type === "Probe") return (
      <>
        <Field label="Manufacturer" required><Select value={form.manufacturer_id} onChange={(e)=>{set("manufacturer_id",e.target.value);set("model_id","");}} options={masters.equipmentManufacturers.map(x=>({value:x.id,label:x.name}))} required /></Field>
        <Field label="Model" required><Select value={form.model_id} onChange={(e)=>set("model_id",e.target.value)} options={probeModels.map(x=>({value:x.id,label:x.name}))} disabled={!form.manufacturer_id} placeholder={form.manufacturer_id?"Select model":"Select manufacturer first"} required /></Field>
        <Field label="Probe type" required><Select value={form.probe_type_id} onChange={(e)=>set("probe_type_id",e.target.value)} options={masters.probeTypes.map(x=>({value:x.id,label:x.name}))} required /></Field>
        <Field label="Year"><input type="number" min="1900" max="2100" value={form.year} onChange={(e)=>set("year",e.target.value)} /></Field>
      </>
    );
    if (type === "Board") return (
      <>
        <Field label="Works with which machine" required><Select value={form.machine_model_id} onChange={(e)=>set("machine_model_id",e.target.value)} options={masters.machineModels.map(x=>({value:x.id,label:x.name}))} required /></Field>
        <Field label="Board type" required><Select value={form.board_type_id} onChange={(e)=>set("board_type_id",e.target.value)} options={masters.boardTypes.map(x=>({value:x.id,label:x.name}))} required /></Field>
        <Field label="Part number" required><input value={form.part_number} onChange={(e)=>set("part_number",e.target.value)} required /></Field>
        <Field label="Version number" required><input value={form.version_number} onChange={(e)=>set("version_number",e.target.value)} required /></Field>
        <Field label="Repaired" required>{field("repaired")}</Field>
      </>
    );
    if (type === "PSU") return <Field label="Works with which machine" required><Select value={form.machine_model_id} onChange={(e)=>set("machine_model_id",e.target.value)} options={masters.machineModels.map(x=>({value:x.id,label:x.name}))} required /></Field>;
    if (type === "Monitor") return (
      <>
        <Field label="Works with which machine" required><Select value={form.machine_model_id} onChange={(e)=>set("machine_model_id",e.target.value)} options={masters.machineModels.map(x=>({value:x.id,label:x.name}))} required /></Field>
        <Field label="Size" required>{field("monitor_size")}</Field>
        <Field label="Video input" required>{field("video_input")}</Field>
      </>
    );
    if (type === "EMI Filter") return <Field label="Type" required>{field("emi_type")}</Field>;
    if (type === "Hard Disk") return (
      <>
        <Field label="Manufacturer" required><Select value={form.manufacturer_id} onChange={(e)=>set("manufacturer_id",e.target.value)} options={masters.hardDiskManufacturers.map(x=>({value:x.id,label:x.name}))} required /></Field>
        <Field label="Capacity (GB)" required><input type="number" min="0" step="1" value={form.capacity_gb} onChange={(e)=>set("capacity_gb",e.target.value)} required /></Field>
        <Field label="Size (inches)" required><input type="number" min="0" step="0.1" value={form.size_inches} onChange={(e)=>set("size_inches",e.target.value)} required /></Field>
        <Field label="Type" required>{field("hard_disk_type")}</Field>
        <Field label="Works with which machine"><Select value={form.machine_model_id} onChange={(e)=>set("machine_model_id",e.target.value)} options={masters.machineModels.map(x=>({value:x.id,label:x.name}))} placeholder="Optional / unassigned" /></Field>
        <Field label="Software version"><input value={form.software_version} onChange={(e)=>set("software_version",e.target.value)} /></Field>
      </>
    );
    return <Field label="Works with which machine" required><Select value={form.machine_model_id} onChange={(e)=>set("machine_model_id",e.target.value)} options={masters.machineModels.map(x=>({value:x.id,label:x.name}))} required /></Field>;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card redesign-modal">
        <div className="modal-header"><div><p className="section-kicker">ADD INVENTORY</p><h2>Add {type}</h2><p>Enter the characteristics specific to this item type.</p></div><button className="modal-close" onClick={onClose}>×</button></div>
        {loading ? <div className="modal-loading">Loading master data...</div> : (
          <form className="redesign-form" onSubmit={save}>
            <div className="redesign-form-section"><h3>Step 1 · Common inventory information</h3><div className="redesign-grid">
              <Field label="Serial number"><input value={form.serial_number} onChange={(e)=>set("serial_number",e.target.value)} /></Field>
              <Field label="Location"><Select value={form.current_location_id} onChange={(e)=>set("current_location_id",e.target.value)} options={masters.locations.map(x=>({value:x.id,label:x.name}))} placeholder="Not set" /></Field>
              <Field label="Status" required><Select value={form.status_id} onChange={(e)=>set("status_id",e.target.value)} options={masters.statuses.map(x=>({value:x.id,label:x.name}))} required /></Field>
              <Field label="Quality" required><Select value={form.quality_status_id} onChange={(e)=>set("quality_status_id",e.target.value)} options={masters.qualities.map(x=>({value:x.id,label:x.name}))} required /></Field>
              <Field label="Quality note"><input value={form.quality_note} onChange={(e)=>set("quality_note",e.target.value)} /></Field>
            </div></div>
            <div className="redesign-form-section"><h3>Step 2 · {type} characteristics</h3><div className="redesign-grid">{specificFields()}</div></div>
            {error && <div className="error-message">{error}</div>}
            <div className="modal-actions"><div></div><div className="modal-actions-right"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving?"Adding...":"Add item"}</button></div></div>
          </form>
        )}
      </div>
    </div>
  );
}

export function RedesignedGlobalStock({ supabase, canEdit }) {
  const [activeType, setActiveType] = useState("Machine");
  const [items, setItems] = useState([]);
  const [masters, setMasters] = useState({ statuses: [], qualities: [], locations: [], equipmentManufacturers: [], hardDiskManufacturers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  async function loadMasters() {
    const [s,q,l,em,hm] = await Promise.all([
      supabase.from("statuses").select("id,name").eq("is_active",true).order("name"),
      supabase.from("quality_statuses").select("id,name").eq("is_active",true).order("name"),
      supabase.from("locations").select("id,name").eq("is_active",true).order("name"),
      supabase.from("equipment_manufacturers").select("id,name").order("name"),
      supabase.from("hard_disk_manufacturers").select("id,name").order("name"),
    ]);
    const bad = [s,q,l,em,hm].find(x=>x.error);
    if (bad) { setError(bad.error.message); return; }
    setMasters({statuses:s.data||[],qualities:q.data||[],locations:l.data||[],equipmentManufacturers:em.data||[],hardDiskManufacturers:hm.data||[]});
  }

  async function loadItems() {
    setLoading(true); setError("");
    const { data, error: itemError } = await supabase.from("items").select("*").eq("item_type", activeType).order("created_at",{ascending:false});
    if (itemError) { setError(itemError.message); setItems([]); setLoading(false); return; }
    const rows = data || [];
    const ids = rows.map(x=>x.id);
    const table = {Machine:"machine_details",Probe:"probe_details",Board:"board_details",PSU:"psu_details",Monitor:"monitor_details","EMI Filter":"emi_filter_details","Hard Disk":"hard_disk_details",Keyboard:"keyboard_details"}[activeType];
    let details = [];
    if (ids.length) {
      const result = await supabase.from(table).select("*").in("item_id",ids);
      if (result.error) { setError(result.error.message); setItems([]); setLoading(false); return; }
      details = result.data || [];
    }
    const detailMap = Object.fromEntries(details.map(x=>[x.item_id,x]));
    setItems(rows.map(x=>({...x, detail:detailMap[x.id]||{}})));
    setLoading(false);
  }

  useEffect(() => { loadMasters(); }, []);
  useEffect(() => { loadItems(); }, [activeType]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
  }, [items, search]);

  function manufacturerName(item) {
    const id = item.detail?.manufacturer_id;
    const list = activeType === "Hard Disk" ? masters.hardDiskManufacturers : masters.equipmentManufacturers;
    return list.find(x=>x.id===id)?.name || "—";
  }

  function machineSpecificColumns() {
    const d = TYPE_CONFIG[activeType];
    return d;
  }

  const columns = machineSpecificColumns();

  function display(item, key) {
    const d=item.detail||{};
    if (key==="manufacturer") return manufacturerName(item);
    if (key==="model") {
      const list = activeType==="Machine" ? [] : [];
      return d.model_id || "—";
    }
    if (key==="machine_model") return d.compatible_machine_model_id || "—";
    if (key==="probe_type") return d.probe_type_id || "—";
    if (key==="board_type") return d.board_type_id || "—";
    if (key==="functions") return Array.isArray(d.functions)?d.functions.join(", "):"—";
    if (key==="portable") return d.portable == null ? "—" : d.portable ? "Yes":"No";
    if (key==="connectors") return d.connector_count ?? "—";
    if (key==="manufacturer_year") return d.manufacturer_year ?? "—";
    if (key==="year") return d.year ?? "—";
    if (key==="monitor_size") return d.monitor_size ?? d.size ?? "—";
    if (key==="software_version") return d.software_version || "—";
    if (key==="repaired") return d.repaired == null ? "—" : d.repaired ? "Yes":"No";
    if (key==="emi_type") return d.filter_type || "—";
    if (key==="capacity_gb") return d.capacity_gb ?? "—";
    if (key==="size_inches") return d.size_inches ?? "—";
    if (key==="hard_disk_type") return d.disk_type || "—";
    if (key==="part_number") return d.part_number || "—";
    if (key==="version_number") return d.version_number || "—";
    if (key==="video_input") return d.video_input || "—";
    return "—";
  }

  return (
    <section className="content-card redesign-stock">
      <div className="section-heading"><div><p className="section-kicker">GLOBAL STOCK</p><h2>Inventory by item type</h2><p>Item types are fixed by the IMS design. Select a type to see only its relevant characteristics.</p></div><button className="primary-button" onClick={()=>setShowAdd(true)} disabled={!canEdit}>+ Add item</button></div>
      <div className="redesign-tabs">{ITEM_TYPES.map(type=><button key={type} className={type===activeType?"redesign-tab active":"redesign-tab"} onClick={()=>{setActiveType(type);setSearch("");}}>{type}</button>)}</div>
      <div className="redesign-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={"Search "+activeType+"..."} /><button className="secondary-button" onClick={loadItems}>Refresh</button></div>
      {error && <div className="error-message">{error}</div>}
      <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Serial number</th>{columns.map(c=><th key={c}>{FIELD_LABELS[c]}</th>)}<th>Status</th><th>Quality</th><th>Location</th></tr></thead><tbody>
        {!loading && filtered.length===0 && <tr><td colSpan={columns.length+4} className="empty-cell">{items.length?"No matching items.":"No items of this type yet."}</td></tr>}
        {filtered.map(item=><tr key={item.id}><td><strong>{item.serial_number||"—"}</strong></td>{columns.map(c=><td key={c}>{display(item,c)}</td>)}<td>{masters.statuses.find(x=>x.id===item.status_id)?.name||"—"}</td><td>{masters.qualities.find(x=>x.id===item.quality_status_id)?.name||"—"}</td><td>{masters.locations.find(x=>x.id===item.current_location_id)?.name||"—"}</td></tr>)}
      </tbody></table></div>
      {showAdd && <ItemForm supabase={supabase} type={activeType} onClose={()=>setShowAdd(false)} onSaved={async()=>{setShowAdd(false);await loadItems();}} />}
    </section>
  );
}

export function RedesignedMasterData({ supabase }) {
  const [active, setActive] = useState(MASTER_GROUPS[0]);
  const [rows, setRows] = useState([]);
  const [refs, setRefs] = useState([]);
  const [form, setForm] = useState({name:"",manufacturer_id:""});
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    const select = active.manufacturer ? "id,name,manufacturer_id,is_active" : "id,name,is_active";
    const result = await supabase.from(active.table).select(select).order("name");
    if (result.error) { setError(result.error.message); setRows([]); setLoading(false); return; }
    setRows(result.data||[]);
    if (active.manufacturer) {
      const r = await supabase.from("equipment_manufacturers").select("id,name").order("name");
      if (r.error) setError(r.error.message); else setRefs(r.data||[]);
    } else setRefs([]);
    setLoading(false);
  }

  useEffect(()=>{load();},[active.table]);

  function begin(row=null) {
    setEditing(row ? row.id : "new");
    setForm({name:row?.name||"",manufacturer_id:row?.manufacturer_id||""});
    setError("");
  }

  async function save(e) {
    e.preventDefault(); setSaving(true); setError("");
    if (!form.name.trim()) { setError("Name is required."); setSaving(false); return; }
    if (active.manufacturer && !form.manufacturer_id) { setError("Manufacturer is required."); setSaving(false); return; }
    const payload = {name:form.name.trim(), ...(active.manufacturer ? {manufacturer_id:form.manufacturer_id} : {})};
    const result = editing==="new" ? await supabase.from(active.table).insert(payload) : await supabase.from(active.table).update(payload).eq("id",editing);
    if (result.error) { setError(result.error.message); setSaving(false); return; }
    setSaving(false); setEditing(null); setForm({name:"",manufacturer_id:""}); await load();
  }

  async function remove(row) {
    if (!window.confirm('Delete "'+row.name+'"? This cannot be undone.')) return;
    const result = await supabase.from(active.table).delete().eq("id",row.id);
    if (result.error) setError(result.error.message); else await load();
  }

  return (
    <section className="master-card redesign-master">
      <div className="master-header"><div><p className="section-kicker">ADMINISTRATION</p><h2>Master Data</h2><p>Item types are fixed. Manage only the reusable reference data required by the IMS.</p></div></div>
      <div className="master-tabs redesign-master-tabs">{MASTER_GROUPS.map(g=><button key={g.key} className={g.key===active.key?"master-tab active":"master-tab"} onClick={()=>{setActive(g);setEditing(null);setError("");}}>{g.label}</button>)}</div>
      <div className="master-content">
        <div className="master-content-title"><div><strong>{active.label}</strong><span>{rows.length} record{rows.length===1?"":"s"}</span></div><button className="primary-button" onClick={()=>begin()}>+ Add</button></div>
        {editing && <form className="master-edit-form" onSubmit={save}><div className="master-form-field"><label>Name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} autoFocus /></div>{active.manufacturer&&<div className="master-form-field"><label>Manufacturer</label><Select value={form.manufacturer_id} onChange={e=>setForm({...form,manufacturer_id:e.target.value})} options={refs.map(x=>({value:x.id,label:x.name}))} required /></div>}<div className="master-form-actions"><button type="button" className="secondary-button" onClick={()=>setEditing(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?"Saving...":"Save"}</button></div></form>}
        {error&&<div className="error-message master-error">{error}</div>}
        <div className="master-table-wrap"><table className="master-table"><thead><tr><th>Name</th>{active.manufacturer&&<th>Manufacturer</th>}<th>Active</th><th>Action</th></tr></thead><tbody>{!loading&&rows.length===0&&<tr><td colSpan={active.manufacturer?4:3} className="empty-cell">No records found.</td></tr>}{rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td>{active.manufacturer&&<td>{refs.find(x=>x.id===row.manufacturer_id)?.name||"—"}</td>}<td>{row.is_active===false?"Inactive":"Active"}</td><td><div className="row-actions"><button className="table-button" onClick={()=>begin(row)}>Edit</button><button className="table-button delete-button" onClick={()=>remove(row)}>Delete</button></div></td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
