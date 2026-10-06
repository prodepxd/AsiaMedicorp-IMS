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
  { key: "equipment_manufacturers", label: "Equipment Manufacturers", table: "equipment_manufacturers" },
  { key: "machine_models", label: "Machine Models", table: "machine_models", manufacturer: true },
  { key: "probe_types", label: "Probe Types", table: "probe_types" },
  { key: "probe_models", label: "Probe Models", table: "probe_models" },
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

function ItemForm({ supabase, type: initialType, onClose, onSaved }) {
  const [type, setType] = useState(initialType || "");
  const [masters, setMasters] = useState({
    equipmentManufacturers: [], hardDiskManufacturers: [], machineModels: [],
    probeModels: [], probeTypes: [], boardTypes: [], locations: [], statuses: [], qualities: [],
  });
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const requests = [
        supabase.from("equipment_manufacturers").select("id,name").order("name"),
        supabase.from("hard_disk_manufacturers").select("id,name").order("name"),
        supabase.from("machine_models").select("id,name,manufacturer_id").order("name"),
        supabase.from("probe_models").select("id,name").order("name"),
        supabase.from("probe_types").select("id,name").order("name"),
        supabase.from("board_types").select("id,name").order("name"),
        supabase.from("locations").select("id,name").eq("is_active", true).order("name"),
        supabase.from("statuses").select("id,name").eq("is_active", true).order("name"),
        supabase.from("quality_statuses").select("id,name").eq("is_active", true).order("name"),
      ];
      const results = await Promise.all(requests);
      const failed = results.find((r) => r.error);
      if (!alive) return;
      if (failed) { setError(failed.error.message); setLoading(false); return; }
      const values = results.map((r) => r.data || []);
      setMasters({
        equipmentManufacturers: values[0], hardDiskManufacturers: values[1],
        machineModels: values[2], probeModels: values[3], probeTypes: values[4],
        boardTypes: values[5], locations: values[6], statuses: values[7], qualities: values[8],
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
  const machineModels = masters.machineModels.filter((m) => !form.manufacturer_id || m.manufacturer_id === form.manufacturer_id);
  const probeModels = masters.probeModels.filter((m) => !form.manufacturer_id || m.manufacturer_id === form.manufacturer_id);

  const stepsForType = {
    Machine: [
      {key:"manufacturer_id",label:"Manufacturer",type:"manufacturer",required:true},
      {key:"model_id",label:"Model",type:"machine_model",required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"manufacturer_year",label:"Manufacturer year",type:"number",required:true,min:1900,max:2100},
      {key:"functions",label:"Functions",type:"functions",optional:true},
      {key:"connectors",label:"Number of connectors",type:"select",options:SELECT_OPTIONS.connectors,required:true},
      {key:"monitor_size",label:"Monitor size",type:"select",options:SELECT_OPTIONS.monitor_size,required:true},
      {key:"software_version",label:"Software version",type:"text",required:true},
      {key:"portable",label:"Portable",type:"select",options:SELECT_OPTIONS.portable,required:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    Probe: [
      {key:"manufacturer_id",label:"Manufacturer",type:"manufacturer",required:true},
      {key:"probe_type_id",label:"Probe type",type:"probe_type",required:true},
      {key:"model_id",label:"Model",type:"probe_model",required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"year",label:"Year",type:"number",optional:true,min:1900,max:2100},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    Board: [
      {key:"machine_model_id",label:"Works with which machine",type:"machine_model",required:true},
      {key:"board_type_id",label:"Board type",type:"board_type",required:true},
      {key:"part_number",label:"Part number",type:"text",required:true},
      {key:"version_number",label:"Version number",type:"text",required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"repaired",label:"Repaired",type:"select",options:SELECT_OPTIONS.repaired,required:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    PSU: [
      {key:"machine_model_id",label:"Works with which machine",type:"machine_model",required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    Monitor: [
      {key:"machine_model_id",label:"Works with which machine",type:"machine_model",required:true},
      {key:"monitor_size",label:"Size",type:"select",options:SELECT_OPTIONS.monitor_size,required:true},
      {key:"video_input",label:"Video input",type:"select",options:SELECT_OPTIONS.video_input,required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    "EMI Filter": [
      {key:"emi_type",label:"Type",type:"select",options:SELECT_OPTIONS.emi_type,required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    "Hard Disk": [
      {key:"manufacturer_id",label:"Manufacturer",type:"hard_disk_manufacturer",required:true},
      {key:"hard_disk_type",label:"Type",type:"select",options:SELECT_OPTIONS.hard_disk_type,required:true},
      {key:"capacity_gb",label:"Capacity (GB)",type:"number",required:true,min:0,step:1},
      {key:"size_inches",label:"Size (inches)",type:"number",required:true,min:0,step:0.1},
      {key:"machine_model_id",label:"Works with which machine",type:"machine_model",optional:true},
      {key:"software_version",label:"Software version",type:"text",optional:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    Keyboard: [
      {key:"machine_model_id",label:"Works with which machine",type:"machine_model",required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
  };

  const steps = type ? stepsForType[type] || [] : [];
  const currentField = step > 0 ? steps[step - 1] : null;
  const totalSteps = steps.length + 1;

  function selectType(nextType) {
    setType(nextType);
    setForm(emptyForm());
    setError("");
  }

  function currentValueValid() {
    if (!currentField || !currentField.required) return true;
    const value = form[currentField.key];
    if (Array.isArray(value)) return true;
    return String(value ?? "").trim() !== "";
  }

  function nextStep() {
    setError("");
    if (!currentValueValid()) {
      setError(currentField.label + " is required.");
      return;
    }
    setStep((value) => Math.min(value + 1, totalSteps - 1));
  }

  function previousStep() {
    setError("");
    setStep((value) => Math.max(1, value - 1));
  }

  function fieldControl(field) {
    const value = form[field.key] ?? "";
    const onChange = (event) => set(field.key, event.target.value);

    if (field.type === "functions") {
      return <div className="redesign-checks">{["4D","Cardiac","Elastography"].map((name) =>
        <label key={name}><input type="checkbox" checked={form.functions.includes(name)}
          onChange={(event) => set("functions", event.target.checked ? [...form.functions, name] : form.functions.filter((item) => item !== name))}/>{name}</label>
      )}</div>;
    }

    if (field.type === "manufacturer") return <Select value={value}
      onChange={(event) => { set("manufacturer_id", event.target.value); set("model_id", ""); }}
      options={masters.equipmentManufacturers.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "hard_disk_manufacturer") return <Select value={value} onChange={onChange}
      options={masters.hardDiskManufacturers.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "machine_model") {
      const options = field.key === "model_id"
        ? machineModels.map((x) => ({value:x.id,label:x.name}))
        : masters.machineModels.map((x) => ({value:x.id,label:x.name}));
      return <Select value={value} onChange={onChange} options={options}
        placeholder={field.key === "model_id" ? (form.manufacturer_id ? "Select model" : "Select manufacturer first") : (field.optional ? "Optional / unassigned" : "Select machine")}
        disabled={field.key === "model_id" && !form.manufacturer_id} required={field.required}/>;
    }

    if (field.type === "probe_model") return <Select value={value} onChange={onChange}
      options={masters.probeModels.map((x) => ({value:x.id,label:x.name}))}
      placeholder="Select model"
      required />;

    if (field.type === "probe_type") return <Select value={value} onChange={onChange}
      options={masters.probeTypes.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "board_type") return <Select value={value} onChange={onChange}
      options={masters.boardTypes.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "location") return <Select value={value} onChange={onChange}
      options={masters.locations.map((x) => ({value:x.id,label:x.name}))} placeholder="Not set" />;

    if (field.type === "status") return <Select value={value} onChange={onChange}
      options={masters.statuses.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "quality") return <Select value={value} onChange={onChange}
      options={masters.qualities.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "select") return <Select value={value} onChange={onChange}
      options={field.options} required={field.required} />;

    return <input type={field.type === "number" ? "number" : "text"} min={field.min} max={field.max}
      step={field.step} value={value} onChange={onChange} autoFocus />;
  }

  async function save() {
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
      manufacturer_id: form.manufacturer_id, model_id: form.model_id,
      manufacturer_year: Number(form.manufacturer_year), monitor_size: Number(form.monitor_size),
      software_version: form.software_version.trim(), functions: form.functions,
      portable: form.portable === "Yes", connector_count: Number(form.connectors),
    };
    if (type === "Probe") details = {
      manufacturer_id: form.manufacturer_id, model_id: form.model_id,
      probe_type_id: form.probe_type_id, year: form.year ? Number(form.year) : null,
    };
    if (type === "Board") details = {
      compatible_machine_model_id: form.machine_model_id, board_type_id: form.board_type_id,
      part_number: form.part_number.trim(), version_number: form.version_number.trim(),
      repaired: form.repaired === "Yes",
    };
    if (type === "PSU") details = { compatible_machine_model_id: form.machine_model_id };
    if (type === "Monitor") details = {
      compatible_machine_model_id: form.machine_model_id, size: Number(form.monitor_size),
      video_input: form.video_input,
    };
    if (type === "EMI Filter") details = { filter_type: form.emi_type };
    if (type === "Hard Disk") details = {
      manufacturer_id: form.manufacturer_id, capacity_gb: Number(form.capacity_gb),
      size_inches: Number(form.size_inches), disk_type: form.hard_disk_type,
      compatible_machine_model_id: form.machine_model_id || null,
      software_version: form.software_version.trim() || null,
    };
    if (type === "Keyboard") details = { compatible_machine_model_id: form.machine_model_id };

    const { data: item, error: itemError } = await supabase.from("items").insert(common).select("id").single();
    if (itemError) { setError(itemError.message); setSaving(false); return; }

    const table = {
      Machine:"machine_details", Probe:"probe_details", Board:"board_details", PSU:"psu_details",
      Monitor:"monitor_details", "EMI Filter":"emi_filter_details", "Hard Disk":"hard_disk_details",
      Keyboard:"keyboard_details",
    }[type];

    const { error: detailError } = await supabase.from(table).insert({item_id:item.id,...details});
    if (detailError) {
      await supabase.from("items").delete().eq("id", item.id);
      setError(detailError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
  }

  if (loading) return <div className="modal-backdrop"><div className="modal-card redesign-modal"><div className="modal-loading">Loading master data...</div></div></div>;

  const isTypeStep = step === 0;
  const isLastStep = type && step === steps.length;

  return <div className="modal-backdrop"><div className="modal-card redesign-modal">
    <div className="modal-header redesign-modal-header"><div>
      <p className="section-kicker">ADD INVENTORY</p>
      <h2>{isTypeStep ? "Select item type" : "Add " + type}</h2>
      <p>{isTypeStep ? "Choose the item type first. Only its relevant characteristics will be shown." : "Enter the item details one characteristic at a time."}</p>
    </div><button className="modal-close" onClick={onClose}>×</button></div>
    {!isTypeStep && <div className="redesign-progress">
      <div className="redesign-progress-meta"><span>Step {step} of {steps.length}</span><strong>{currentField.label}</strong></div>
      <div className="redesign-progress-track"><span style={{width: ((step / steps.length) * 100) + "%"}} /></div>
    </div>}

    {isTypeStep ? <div className="redesign-form"><div className="redesign-form-section">
      <h3>Step 1 · Item type</h3>
      <div className="redesign-type-picker">{ITEM_TYPES.map((itemType) =>
        <button key={itemType} type="button"
          className={itemType === type ? "redesign-type-option selected" : "redesign-type-option"}
          onClick={() => selectType(itemType)}>
          <span className="redesign-type-check">{itemType === type ? "✓" : ""}</span>
          <span>{itemType}</span>
        </button>
      )}</div>
    </div>{error && <div className="error-message">{error}</div>}
      <div className="modal-actions"><div/>
        <div className="modal-actions-right">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={nextStep} disabled={!type}>Next</button>
        </div>
      </div>
    </div> : <div className="redesign-form">
      <div className="redesign-form-section">
        <div className="redesign-field-intro">
          <span className="redesign-field-step">CURRENT CHARACTERISTIC</span>
          <h3>{currentField.label}{currentField.required ? <span className="required-mark"> *</span> : <span className="optional-mark"> · Optional</span>}</h3>
          <p>{currentField.required ? "This information is required to add the item." : "You can leave this blank if the information is not currently available."}</p>
        </div>
        <div className="redesign-grid"><Field label={currentField.label} required={currentField.required}>{fieldControl(currentField)}</Field></div>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="modal-actions"><div>
        <button type="button" className="secondary-button" onClick={() => setStep(0)}>Back to item type</button>
      </div><div className="modal-actions-right">
        <button type="button" className="secondary-button" onClick={step === 1 ? onClose : previousStep}>{step === 1 ? "Cancel" : "Back"}</button>
        {!isLastStep
          ? <button type="button" className="primary-button" onClick={nextStep}>Next</button>
          : <button type="button" className="primary-button" onClick={async () => {
              if (!currentValueValid()) { setError(currentField.label + " is required."); return; }
              await save();
            }} disabled={saving}>{saving ? "Adding..." : "Add item"}</button>}
      </div></div>
    </div>}
  </div></div>;
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
    const [s,q,l,em,hm,mm,pm,pt,bt] = await Promise.all([
      supabase.from("statuses").select("id,name").eq("is_active",true).order("name"),
      supabase.from("quality_statuses").select("id,name").eq("is_active",true).order("name"),
      supabase.from("locations").select("id,name").eq("is_active",true).order("name"),
      supabase.from("equipment_manufacturers").select("id,name").order("name"),
      supabase.from("hard_disk_manufacturers").select("id,name").order("name"),
      supabase.from("machine_models").select("id,name").order("name"),
      supabase.from("probe_models").select("id,name").order("name"),
      supabase.from("probe_types").select("id,name").order("name"),
      supabase.from("board_types").select("id,name").order("name"),
    ]);
    const bad = [s,q,l,em,hm,mm,pm,pt,bt].find(x=>x.error);
    if (bad) { setError(bad.error.message); return; }
    setMasters({
      statuses:s.data||[], qualities:q.data||[], locations:l.data||[],
      equipmentManufacturers:em.data||[], hardDiskManufacturers:hm.data||[],
      machineModels:mm.data||[], probeModels:pm.data||[], probeTypes:pt.data||[], boardTypes:bt.data||[],
    });
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
      const list = activeType === "Machine" ? masters.machineModels : masters.probeModels;
      return list.find(x=>x.id===d.model_id)?.name || "—";
    }
    if (key==="machine_model") return masters.machineModels.find(x=>x.id===d.compatible_machine_model_id)?.name || "—";
    if (key==="probe_type") return masters.probeTypes.find(x=>x.id===d.probe_type_id)?.name || "—";
    if (key==="board_type") return masters.boardTypes.find(x=>x.id===d.board_type_id)?.name || "—";
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

export function RedesignedMasterData({ supabase, canEdit }) {
  const [active, setActive] = useState(MASTER_GROUPS[0]);
  const [rows, setRows] = useState([]);
  const [refs, setRefs] = useState([]);
  const [form, setForm] = useState({name:"",manufacturer_id:""});
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [referenceCounts, setReferenceCounts] = useState({});

  async function load() {
    setLoading(true); setError("");
    const select = active.manufacturer ? "id,name,manufacturer_id,is_active" : "id,name,is_active";
    const result = await supabase.from(active.table).select(select).order("name");
    if (result.error) { setError(result.error.message); setRows([]); setLoading(false); return; }
    const loadedRows = result.data || [];
    setRows(loadedRows);
    if (active.manufacturer) {
      const r = await supabase.from("equipment_manufacturers").select("id,name").order("name");
      if (r.error) setError(r.error.message); else setRefs(r.data||[]);
    } else setRefs([]);

    const referenceMap = {
      equipment_manufacturers: [
        ["machine_models", "manufacturer_id"],
        ["machine_details", "manufacturer_id"],
        ["probe_details", "manufacturer_id"],
      ],
      machine_models: [
        ["machine_details", "model_id"],
        ["board_details", "compatible_machine_model_id"],
        ["psu_details", "compatible_machine_model_id"],
        ["monitor_details", "compatible_machine_model_id"],
        ["hard_disk_details", "compatible_machine_model_id"],
        ["keyboard_details", "compatible_machine_model_id"],
      ],
      probe_types: [["probe_details", "probe_type_id"]],
      probe_models: [["probe_details", "model_id"]],
      hard_disk_manufacturers: [["hard_disk_details", "manufacturer_id"]],
      board_types: [["board_details", "board_type_id"]],
      locations: [["items", "current_location_id"]],
      statuses: [["items", "status_id"]],
      quality_statuses: [["items", "quality_status_id"]],
      transit_statuses: [["transit_events", "status_id"]],
      suppliers: [["purchases", "supplier_id"]],
      customers: [["sales", "customer_id"]],
    };

    const dependencies = referenceMap[active.table] || [];
    const counts = {};
    await Promise.all(loadedRows.map(async (row) => {
      if (!dependencies.length) {
        counts[row.id] = false;
        return;
      }
      const results = await Promise.all(
        dependencies.map(([table, column]) =>
          supabase.from(table).select("id", { count: "exact", head: true }).eq(column, row.id)
        )
      );
      counts[row.id] = results.some((r) => (r.count || 0) > 0);
    }));
    setReferenceCounts(counts);
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
    if (referenceCounts[row.id]) return;
    if (!window.confirm('Delete "'+row.name+'"? This cannot be undone.')) return;
    const result = await supabase.from(active.table).delete().eq("id",row.id);
    if (result.error) setError(result.error.message); else await load();
  }

  return (
    <section className="master-card redesign-master">
      <div className="master-header"><div><p className="section-kicker">ADMINISTRATION</p><h2>Master Data</h2><p>Item types are fixed. Manage only the reusable reference data required by the IMS.</p></div></div>
      <div className="master-tabs redesign-master-tabs">{MASTER_GROUPS.map(g=><button key={g.key} className={g.key===active.key?"master-tab active":"master-tab"} onClick={()=>{setActive(g);setEditing(null);setError("");}}>{g.label}</button>)}</div>
      <div className="master-content">
        <div className="master-content-title"><div><strong>{active.label}</strong><span>{rows.length} record{rows.length===1?"":"s"}</span></div><button className="primary-button" onClick={()=>begin()} disabled={!canEdit}>+ Add</button></div>
        {editing && <form className="master-edit-form" onSubmit={save}><div className="master-form-field"><label>Name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} autoFocus /></div>{active.manufacturer&&<div className="master-form-field"><label>Manufacturer</label><Select value={form.manufacturer_id} onChange={e=>setForm({...form,manufacturer_id:e.target.value})} options={refs.map(x=>({value:x.id,label:x.name}))} required /></div>}<div className="master-form-actions"><button type="button" className="secondary-button" onClick={()=>setEditing(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?"Saving...":"Save"}</button></div></form>}
        {error&&<div className="error-message master-error">{error}</div>}
        <div className="master-table-wrap"><table className="master-table"><thead><tr><th>Name</th>{active.manufacturer&&<th>Manufacturer</th>}<th>Active</th><th>Action</th></tr></thead><tbody>{!loading&&rows.length===0&&<tr><td colSpan={active.manufacturer?4:3} className="empty-cell">No records found.</td></tr>}{rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td>{active.manufacturer&&<td>{refs.find(x=>x.id===row.manufacturer_id)?.name||"—"}</td>}<td>{row.is_active===false?"Inactive":"Active"}</td><td><div className="row-actions"><button className="table-button" onClick={()=>begin(row)} disabled={!canEdit}>Edit</button><button
  className={referenceCounts[row.id] ? "table-button delete-button delete-disabled" : "table-button delete-button"}
  onClick={()=>remove(row)}
  disabled={!canEdit || referenceCounts[row.id]}
  title={referenceCounts[row.id] ? "Cannot delete: this record is referenced by existing data." : "Delete"}
>
  Delete
</button></div></td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
