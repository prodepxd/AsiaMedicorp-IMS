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
  Board: ["compatible_machine", "board_type", "part_number", "version_number", "repaired"],
  PSU: ["compatible_machine"],
  Monitor: ["compatible_machine", "monitor_size", "video_input"],
  "EMI Filter": ["emi_type"],
  "Hard Disk": ["manufacturer", "capacity_gb", "size_inches", "hard_disk_type", "compatible_machine", "software_version"],
  Keyboard: ["compatible_machine"],
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
  compatible_machine: "Compatible machine",
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

export const MASTER_GROUPS = [
  { key: "equipment_manufacturers", label: "Equipment Manufacturers", table: "equipment_manufacturers" },
  { key: "machine_models", label: "Machine Models", table: "machine_models", manufacturer: true },
  { key: "probe_types", label: "Probe Types", table: "probe_types" },
  { key: "probe_models", label: "Probe Models", table: "probe_models", manufacturer: true, probeType: true },
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
    compatible_machine_manufacturer_id: "",
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

function activeOrCurrent(list, currentIds = []) {
  const ids = Array.isArray(currentIds) ? currentIds : [currentIds];
  return (list || []).filter((row) => row.is_active !== false || ids.includes(row.id));
}

function ItemForm({ supabase, type: initialType, editItem = null, onClose, onSaved }) {
  const [type, setType] = useState(initialType || "");
  const [masters, setMasters] = useState({
    equipmentManufacturers: [], hardDiskManufacturers: [], machineModels: [],
    probeModels: [], probeTypes: [], boardTypes: [], locations: [], statuses: [], qualities: [],
  });
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(editItem ? 1 : 0);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const requests = [
        supabase.from("equipment_manufacturers").select("id,name,is_active").order("name"),
        supabase.from("hard_disk_manufacturers").select("id,name,is_active").order("name"),
        supabase.from("machine_models").select("id,name,manufacturer_id,is_active").order("name"),
        supabase.from("probe_models").select("id,name,manufacturer_id,probe_type_id,is_active").order("name"),
        supabase.from("probe_types").select("id,name,is_active").order("name"),
        supabase.from("board_types").select("id,name,is_active").order("name"),
        supabase.from("locations").select("id,name,is_active").order("name"),
        supabase.from("statuses").select("id,name,is_active").order("name"),
        supabase.from("quality_statuses").select("id,name,is_active").order("name"),
      ];
      const results = await Promise.all(requests);
      const failed = results.find((r) => r.error);
      if (!alive) return;
      if (failed) { setError(failed.error.message); setLoading(false); return; }
      const values = results.map((r) => r.data || []);
      const d = editItem?.detail || {};
      setMasters({
        equipmentManufacturers: editItem ? activeOrCurrent(values[0], d.manufacturer_id) : activeOrCurrent(values[0]),
        hardDiskManufacturers: editItem ? activeOrCurrent(values[1], d.manufacturer_id) : activeOrCurrent(values[1]),
        machineModels: editItem ? activeOrCurrent(values[2], [d.model_id, d.compatible_machine_model_id]) : activeOrCurrent(values[2]),
        probeModels: editItem ? activeOrCurrent(values[3], d.model_id) : activeOrCurrent(values[3]),
        probeTypes: editItem ? activeOrCurrent(values[4], d.probe_type_id) : activeOrCurrent(values[4]),
        boardTypes: editItem ? activeOrCurrent(values[5], d.board_type_id) : activeOrCurrent(values[5]),
        locations: editItem ? activeOrCurrent(values[6], editItem.current_location_id) : activeOrCurrent(values[6]),
        statuses: editItem ? activeOrCurrent(values[7], editItem.status_id) : activeOrCurrent(values[7]),
        qualities: editItem ? activeOrCurrent(values[8], editItem.quality_status_id) : activeOrCurrent(values[8]),
      });
      const stock = values[7].find((x) => x.name === "In Stock" && x.is_active !== false);
      const good = values[8].find((x) => x.name === "Good" && x.is_active !== false);
      if (editItem) {
        const d = editItem.detail || {};
        const compatibleModel = values[2].find((x) => x.id === d.compatible_machine_model_id);
        setForm({
          ...emptyForm(),
          serial_number: editItem.serial_number || "",
          status_id: editItem.status_id || "",
          quality_status_id: editItem.quality_status_id || "",
          current_location_id: editItem.current_location_id || "",
          quality_note: editItem.quality_note || "",
          manufacturer_id: d.manufacturer_id || "",
          model_id: d.model_id || "",
          manufacturer_year: d.manufacturer_year ?? "",
          monitor_size: d.monitor_size ?? d.size ?? "",
          software_version: d.software_version || "",
          functions: Array.isArray(d.functions) ? d.functions : [],
          portable: d.portable == null ? "" : (d.portable ? "Yes" : "No"),
          connectors: d.connector_count ?? "",
          compatible_machine_manufacturer_id: compatibleModel?.manufacturer_id || "",
          probe_type_id: d.probe_type_id || "",
          year: d.year ?? "",
          machine_model_id: d.compatible_machine_model_id || "",
          board_type_id: d.board_type_id || "",
          part_number: d.part_number || "",
          version_number: d.version_number || "",
          repaired: d.repaired == null ? "" : (d.repaired ? "Yes" : "No"),
          video_input: d.video_input || "",
          emi_type: d.filter_type || "",
          capacity_gb: d.capacity_gb ?? "",
          size_inches: d.size_inches ?? "",
          hard_disk_type: d.disk_type || "",
        });
      } else {
        setForm((current) => ({ ...current, status_id: stock?.id || "", quality_status_id: good?.id || "" }));
      }
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [supabase, editItem]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const machineModels = masters.machineModels.filter((m) => !form.manufacturer_id || m.manufacturer_id === form.manufacturer_id);
  const compatibleMachineModels = masters.machineModels.filter((m) =>
    !form.compatible_machine_manufacturer_id || m.manufacturer_id === form.compatible_machine_manufacturer_id
  );

  const stepsForType = {
    Machine: [
      {key:"manufacturer_id",label:"Manufacturer",type:"manufacturer",required:true},
      {key:"model_id",label:"Model",type:"machine_model",required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"manufacturer_year",label:"Manufacturer year",type:"number",required:true,min:1900,max:2100},
      {key:"functions",label:"Functions",type:"functions",optional:true},
      {key:"connectors",label:"Number of connectors",type:"radio",options:SELECT_OPTIONS.connectors,required:true},
      {key:"monitor_size",label:"Monitor size",type:"radio",options:SELECT_OPTIONS.monitor_size,required:true},
      {key:"software_version",label:"Software version",type:"text",required:true},
      {key:"portable",label:"Portable",type:"radio",options:SELECT_OPTIONS.portable,required:true},
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
      {key:"compatible_machine",label:"Compatible machine",type:"compatible_machine",required:true},
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
      {key:"compatible_machine",label:"Compatible machine",type:"compatible_machine",required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    Monitor: [
      {key:"compatible_machine",label:"Compatible machine",type:"compatible_machine",required:true},
      {key:"monitor_size",label:"Size",type:"radio",options:SELECT_OPTIONS.monitor_size,required:true},
      {key:"video_input",label:"Video input",type:"radio",options:SELECT_OPTIONS.video_input,required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    "EMI Filter": [
      {key:"emi_type",label:"Type",type:"radio",options:SELECT_OPTIONS.emi_type,required:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    "Hard Disk": [
      {key:"manufacturer_id",label:"Manufacturer",type:"hard_disk_manufacturer",required:true},
      {key:"hard_disk_type",label:"Type",type:"radio",options:SELECT_OPTIONS.hard_disk_type,required:true},
      {key:"capacity_gb",label:"Capacity (GB)",type:"number",required:true,min:0,step:1},
      {key:"size_inches",label:"Size (inches)",type:"radio",options:['2.5"','3.5"'],required:true},
      {key:"compatible_machine",label:"Compatible machine",type:"compatible_machine",optional:true},
      {key:"software_version",label:"Software version",type:"text",optional:true},
      {key:"serial_number",label:"Serial number",type:"text",optional:true},
      {key:"current_location_id",label:"Location",type:"location",optional:true},
      {key:"status_id",label:"Status",type:"status",required:true},
      {key:"quality_status_id",label:"Quality",type:"quality",required:true},
      {key:"quality_note",label:"Quality note",type:"text",optional:true},
    ],
    Keyboard: [
      {key:"compatible_machine",label:"Compatible machine",type:"compatible_machine",required:true},
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
    if (currentField.type === "compatible_machine") return Boolean(form.compatible_machine_manufacturer_id && form.machine_model_id);
    const value = form[currentField.key];
    if (Array.isArray(value)) return true;
    return String(value ?? "").trim() !== "";
  }

  async function nextStep() {
    setError("");

    if (step === 0) {
      if (!type) {
        setError("Please select an item type.");
        return;
      }
      setStep(1);
      return;
    }

    if (!currentValueValid()) {
      setError(currentField.label + " is required.");
      return;
    }

    if (currentField.key === "serial_number" && String(form.serial_number || "").trim()) {
      const serial = String(form.serial_number).trim();
      const { data: existingItems, error: duplicateCheckError } = await supabase
        .from("items")
        .select("id,serial_number")
        .not("serial_number", "is", null);

      if (duplicateCheckError) {
        setError("We could not verify this serial number. Please try again.");
        return;
      }

      const normalizedSerial = serial.toLowerCase();
      const duplicate = (existingItems || []).some(
        (item) => item.id !== editItem?.id && String(item.serial_number || "").trim().toLowerCase() === normalizedSerial
      );

      if (duplicate) {
        setError("This serial number is already in use. Please enter a different serial number.");
        return;
      }
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
      const options = machineModels.map((x) => ({value:x.id,label:x.name}));
      return <Select value={value} onChange={onChange} options={options}
        placeholder={form.manufacturer_id ? "Select model" : "Select manufacturer first"}
        disabled={!form.manufacturer_id} required={field.required}/>;
    }

    if (field.type === "compatible_machine") return (
      <div className="redesign-compatible-machine-grid">
        <Select value={form.compatible_machine_manufacturer_id}
          onChange={(event) => {
            set("compatible_machine_manufacturer_id", event.target.value);
            set("machine_model_id", "");
          }}
          options={masters.equipmentManufacturers.map((x) => ({value:x.id,label:x.name}))}
          placeholder={field.optional ? "Optional / unassigned" : "Select manufacturer"}
          required={field.required} />
        <Select value={form.machine_model_id} onChange={(event) => set("machine_model_id", event.target.value)}
          options={compatibleMachineModels.map((x) => ({value:x.id,label:x.name}))}
          placeholder={form.compatible_machine_manufacturer_id ? "Select machine model" : (field.optional ? "Optional / unassigned" : "Select manufacturer first")}
          disabled={!form.compatible_machine_manufacturer_id}
          required={field.required} />
      </div>
    );

    if (field.type === "probe_model") {
      const probeModels = masters.probeModels.filter((x) =>
        (!form.probe_type_id || x.probe_type_id === form.probe_type_id) &&
        (!form.manufacturer_id || x.manufacturer_id === form.manufacturer_id || (editItem && x.id === form.model_id))
      );
      return <Select value={value} onChange={onChange}
        options={probeModels.map((x) => ({value:x.id,label:x.name}))}
        placeholder={!form.manufacturer_id ? "Select manufacturer first" : !form.probe_type_id ? "Select probe type first" : "Select model"}
        disabled={!form.manufacturer_id || !form.probe_type_id}
        required />;
    }

    if (field.type === "probe_type") return <Select value={value}
      onChange={(event) => { set("probe_type_id", event.target.value); set("model_id", ""); }}
      options={masters.probeTypes.map((x) => ({value:x.id,label:x.name}))} required />

    if (field.type === "board_type") return <Select value={value} onChange={onChange}
      options={masters.boardTypes.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "location") return (
      <div className="redesign-radio-group redesign-location-radio-group">
        <label className={value === "" ? "redesign-radio-option selected" : "redesign-radio-option"}>
          <input type="radio" name="location" value="" checked={value === ""} onChange={onChange} />
          <span>Not set</span>
        </label>
        {masters.locations.map((location) => (
          <label key={location.id} className={value === location.id ? "redesign-radio-option selected" : "redesign-radio-option"}>
            <input type="radio" name="location" value={location.id} checked={value === location.id} onChange={onChange} />
            <span>{location.name}</span>
          </label>
        ))}
      </div>
    );

    if (field.type === "status") return <Select value={value} onChange={onChange}
      options={masters.statuses.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "quality") return <Select value={value} onChange={onChange}
      options={masters.qualities.map((x) => ({value:x.id,label:x.name}))} required />;

    if (field.type === "radio") return (
      <div className="redesign-radio-group">
        {field.options.map((option) => (
          <label key={option} className={value === option ? "redesign-radio-option selected" : "redesign-radio-option"}>
            <input type="radio" name={field.key} value={option} checked={value === option} onChange={onChange} />
            <span>{field.key === "monitor_size" ? option + String.fromCharCode(34) : option}</span>
          </label>
        ))}
      </div>
    );

    if (field.type === "location") return (
      <div className="redesign-radio-group">
        {masters.locations.map((location) => (
          <label key={location.id} className={value === location.id ? "redesign-radio-option selected" : "redesign-radio-option"}>
            <input type="radio" name="current_location_id" value={location.id} checked={value === location.id} onChange={onChange} />
            <span>{location.name}</span>
          </label>
        ))}
        <label className={value === "" ? "redesign-radio-option selected" : "redesign-radio-option"}>
          <input type="radio" name="current_location_id" value="" checked={value === ""} onChange={onChange} />
          <span>Not set</span>
        </label>
      </div>
    );

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
      manufacturer_id: form.manufacturer_id,
      model_id: form.model_id,
      manufacturer_year: Number(form.manufacturer_year),
      monitor_size: Number(form.monitor_size),
      software_version: form.software_version.trim(),
      functions: form.functions,
      portable: form.portable === "Yes",
      connector_count: Number(form.connectors),
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
      part_number: form.part_number.trim(),
      version_number: form.version_number.trim(),
      repaired: form.repaired === "Yes",
    };
    if (type === "PSU") details = { compatible_machine_model_id: form.machine_model_id };
    if (type === "Monitor") details = {
      compatible_machine_model_id: form.machine_model_id,
      size: Number(form.monitor_size),
      video_input: form.video_input,
    };
    if (type === "EMI Filter") details = { filter_type: form.emi_type };
    if (type === "Hard Disk") details = {
      manufacturer_id: form.manufacturer_id,
      capacity_gb: Number(form.capacity_gb),
      size_inches: Number(form.size_inches),
      disk_type: form.hard_disk_type,
      compatible_machine_model_id: form.machine_model_id || null,
      software_version: form.software_version.trim() || null,
    };
    if (type === "Keyboard") details = { compatible_machine_model_id: form.machine_model_id };

    const table = {
      Machine:"machine_details",
      Probe:"probe_details",
      Board:"board_details",
      PSU:"psu_details",
      Monitor:"monitor_details",
      "EMI Filter":"emi_filter_details",
      "Hard Disk":"hard_disk_details",
      Keyboard:"keyboard_details",
    }[type];

    if (editItem) {
      const { error: itemError } = await supabase.from("items").update(common).eq("id", editItem.id);
      if (itemError) {
        const duplicateSerial = itemError.code === "23505" && /serial_number/i.test(itemError.message || "");
        setError(duplicateSerial
          ? "This serial number is already in use. Please enter a different serial number."
          : "We could not update this item. Please try again.");
        setSaving(false);
        return;
      }
      const { error: detailError } = await supabase.from(table).update(details).eq("item_id", editItem.id);
      if (detailError) {
        setError(detailError.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: item, error: itemError } = await supabase.from("items").insert(common).select("id").single();
      if (itemError) {
        const duplicateSerial = itemError.code === "23505" && /serial_number/i.test(itemError.message || "");
        setError(duplicateSerial
          ? "This serial number is already in use. Please enter a different serial number."
          : "We could not add this item. Please try again.");
        setSaving(false);
        return;
      }

      const { error: detailError } = await supabase.from(table).insert({ item_id: item.id, ...details });
      if (detailError) {
        await supabase.from("items").delete().eq("id", item.id);
        setError(detailError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  if (loading) return <div className="modal-backdrop"><div className="modal-card redesign-modal"><div className="modal-loading">Loading master data...</div></div></div>;

  const isTypeStep = step === 0;
  const isLastStep = type && step === steps.length;

  return <div className="modal-backdrop"><div className="modal-card redesign-modal">
    <div className="modal-header redesign-modal-header"><div>
      <p className="section-kicker">{editItem ? "EDIT INVENTORY" : "ADD INVENTORY"}</p>
      <h2>{isTypeStep ? "Select item type" : (editItem ? "Edit " : "Add ") + type}</h2>
      <p>{isTypeStep ? "Choose the item type first. Only its relevant characteristics will be shown." : (editItem ? "Update the item details one characteristic at a time." : "Enter the item details one characteristic at a time.")}</p>
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
        <button type="button" className="cancel-button" onClick={onClose}>Cancel</button>
      </div><div className="modal-actions-right">
        {step > 1 && <button type="button" className="secondary-button" onClick={previousStep}>Back</button>}
        {!isLastStep
          ? <button type="button" className="primary-button" onClick={nextStep}>Next</button>
          : <button type="button" className="primary-button" onClick={async () => {
              if (!currentValueValid()) { setError(currentField.label + " is required."); return; }
              await save();
            }} disabled={saving}>{saving ? (editItem ? "Saving..." : "Adding...") : (editItem ? "Save changes" : "Add item")}</button>}
      </div></div>
    </div>}
  </div></div>;
}

export function RedesignedItemView({ supabase, itemId, canEdit, canDelete, onBack, onDeleted, onItemClick }) {
  const [item, setItem] = useState(null);
  const [masters, setMasters] = useState({
    statuses: [], qualities: [], locations: [], equipmentManufacturers: [],
    hardDiskManufacturers: [], machineModels: [], probeModels: [], probeTypes: [], boardTypes: []
  });
  const [components, setComponents] = useState([]);
  const [componentDetails, setComponentDetails] = useState({});
  const [parentMachine, setParentMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [error, setError] = useState("");
  const [componentError, setComponentError] = useState("");
  const [availableComponents, setAvailableComponents] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [componentType, setComponentType] = useState("Probe");
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [addingComponent, setAddingComponent] = useState(false);
  const [removingComponentId, setRemovingComponentId] = useState("");

  const detailTable = (type) => ({
    Machine:"machine_details",
    Probe:"probe_details",
    Board:"board_details",
    PSU:"psu_details",
    Monitor:"monitor_details",
    "EMI Filter":"emi_filter_details",
    "Hard Disk":"hard_disk_details",
    Keyboard:"keyboard_details",
  })[type];

  const componentTypes = ["Probe", "Board", "PSU", "Monitor", "Hard Disk", "Keyboard"];

  async function load() {
    setLoading(true);
    setError("");
    const { data: row, error: itemError } = await supabase.from("items").select("*").eq("id", itemId).single();
    if (itemError) {
      setError(itemError.message);
      setLoading(false);
      return;
    }
    const table = detailTable(row.item_type);
    if (!table) {
      setError("Unsupported item type.");
      setLoading(false);
      return;
    }
    const { data: detail, error: detailError } = await supabase.from(table).select("*").eq("item_id", itemId).single();
    if (detailError) {
      setError(detailError.message);
      setLoading(false);
      return;
    }
    const [s,q,l,em,hm,mm,pm,pt,bt] = await Promise.all([
      supabase.from("statuses").select("id,name,is_active").order("name"),
      supabase.from("quality_statuses").select("id,name,is_active").order("name"),
      supabase.from("locations").select("id,name,is_active").order("name"),
      supabase.from("equipment_manufacturers").select("id,name,is_active").order("name"),
      supabase.from("hard_disk_manufacturers").select("id,name,is_active").order("name"),
      supabase.from("machine_models").select("id,name,manufacturer_id,is_active").order("name"),
      supabase.from("probe_models").select("id,name,manufacturer_id,probe_type_id,is_active").order("name"),
      supabase.from("probe_types").select("id,name,is_active").order("name"),
      supabase.from("board_types").select("id,name,is_active").order("name"),
    ]);
    const bad = [s,q,l,em,hm,mm,pm,pt,bt].find((result) => result.error);
    if (bad) {
      setError(bad.error.message);
      setLoading(false);
      return;
    }
    setMasters({
      statuses:s.data||[],
      qualities:q.data||[],
      locations:l.data||[],
      equipmentManufacturers:em.data||[],
      hardDiskManufacturers:hm.data||[],
      machineModels:mm.data||[],
      probeModels:pm.data||[],
      probeTypes:pt.data||[],
      boardTypes:bt.data||[],
    });
    setItem({...row, detail:detail||{}});
    if (row.item_type !== "Machine") {
      const { data: relationship } = await supabase
        .from("machine_components")
        .select("machine_item_id")
        .eq("component_item_id", row.id)
        .maybeSingle();
      if (relationship?.machine_item_id) {
        const { data: machine } = await supabase
          .from("items")
          .select("id,serial_number")
          .eq("id", relationship.machine_item_id)
          .maybeSingle();
        setParentMachine(machine || null);
      } else {
        setParentMachine(null);
      }
    } else {
      setParentMachine(null);
    }
    setLoading(false);
  }

  async function loadComponents() {
    if (!item || item.item_type !== "Machine") {
      setComponents([]);
      setComponentDetails({});
      return;
    }
    setComponentsLoading(true);
    setComponentError("");
    const { data: links, error: linkError } = await supabase
      .from("machine_components")
      .select("id,component_item_id,installed_at")
      .eq("machine_item_id", item.id)
      .order("installed_at");
    if (linkError) {
      setComponentError(linkError.message);
      setComponentsLoading(false);
      return;
    }
    const componentIds = (links || []).map((x) => x.component_item_id);
    if (!componentIds.length) {
      setComponents([]);
      setComponentDetails({});
      setComponentsLoading(false);
      return;
    }
    const { data: rows, error: componentLoadError } = await supabase
      .from("items")
      .select("id,item_type,serial_number,status_id")
      .in("id", componentIds);
    if (componentLoadError) {
      setComponentError(componentLoadError.message);
      setComponentsLoading(false);
      return;
    }
    const tables = [...new Set((rows || []).map((x) => detailTable(x.item_type)).filter(Boolean))];
    const detailResults = await Promise.all(tables.map((table) => supabase.from(table).select("*").in("item_id", componentIds)));
    const failedDetail = detailResults.find((x) => x.error);
    if (failedDetail) {
      setComponentError(failedDetail.error.message);
      setComponentsLoading(false);
      return;
    }
    const allDetails = detailResults.flatMap((x) => x.data || []);
    const detailsMap = Object.fromEntries(allDetails.map((x) => [x.item_id, x]));
    const rowMap = Object.fromEntries((rows || []).map((x) => [x.id, x]));
    setComponents((links || []).map((link) => ({ ...link, item: rowMap[link.component_item_id], detail: detailsMap[link.component_item_id] || {} })));
    setComponentDetails(detailsMap);
    setComponentsLoading(false);
  }

  useEffect(() => { load(); }, [itemId]);
  async function loadAvailableComponents() {
    if (!item || item.item_type !== "Machine" || !showComponentPicker) {
      setAvailableComponents([]);
      return;
    }
    const idleStatus = masters.statuses.find((x) => x.name === "Idle");
    if (!idleStatus) {
      setComponentError('Status "Idle" was not found in the Statuses master data.');
      return;
    }
    const { data, error: availableError } = await supabase
      .from("items")
      .select("id,item_type,serial_number")
      .eq("item_type", componentType)
      .eq("status_id", idleStatus.id)
      .order("serial_number");
    if (availableError) {
      setComponentError(availableError.message);
      setAvailableComponents([]);
      return;
    }
    setAvailableComponents(data || []);
  }

  useEffect(() => { loadComponents(); }, [item?.id, item?.item_type]);
  useEffect(() => { loadAvailableComponents(); }, [item?.id, item?.item_type, componentType, showComponentPicker, masters.statuses.length]);

  const name = (list, id) => list.find((x) => x.id === id)?.name || "—";
  const statusName = name(masters.statuses, item?.status_id);
  const statusValue = parentMachine && statusName === "In Machine"
    ? <><span>In Machine (</span><button type="button" className="inline-machine-link" onClick={() => onItemClick?.(parentMachine.id)}>{parentMachine.serial_number || "Machine"}</button><span>)</span></>
    : statusName;
  const compatibleName = (id) => {
    const model = masters.machineModels.find((x) => x.id === id);
    const manufacturer = masters.equipmentManufacturers.find((x) => x.id === model?.manufacturer_id);
    return model && manufacturer ? manufacturer.name + " " + model.name : model?.name || "—";
  };

  function componentDisplay(component) {
    const d = component.detail || {};
    const type = component.item?.item_type;
    if (type === "Probe") {
      const model = masters.probeModels.find((x) => x.id === d.model_id)?.name;
      const probeType = masters.probeTypes.find((x) => x.id === d.probe_type_id)?.name;
      return [model, probeType].filter(Boolean).join(" · ") || "Probe";
    }
    if (type === "Board") return [masters.boardTypes.find((x) => x.id === d.board_type_id)?.name, d.part_number].filter(Boolean).join(" · ") || "Board";
    if (type === "PSU") return "PSU";
    if (type === "Monitor") return [d.size == null ? null : d.size + String.fromCharCode(34), d.video_input].filter(Boolean).join(" · ") || "Monitor";
    if (type === "Hard Disk") return [d.capacity_gb == null ? null : d.capacity_gb + " GB", d.disk_type].filter(Boolean).join(" · ") || "Hard Disk";
    if (type === "Keyboard") return "Keyboard";
    return type || "Component";
  }

  const [editingField, setEditingField] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [savingField, setSavingField] = useState(false);

  function beginFieldEdit(field) {
    const d = item.detail || {};
    const current = {
      serial_number: item.serial_number || "",
      status_id: item.status_id || "",
      quality_status_id: item.quality_status_id || "",
      current_location_id: item.current_location_id || "",
      quality_note: item.quality_note || "",
      manufacturer_id: d.manufacturer_id || "",
      model_id: d.model_id || "",
      manufacturer_year: d.manufacturer_year ?? "",
      functions: Array.isArray(d.functions) ? d.functions : [],
      connector_count: d.connector_count ?? "",
      monitor_size: d.monitor_size ?? d.size ?? "",
      software_version: d.software_version || "",
      portable: d.portable == null ? "" : d.portable ? "Yes" : "No",
      probe_type_id: d.probe_type_id || "",
      year: d.year ?? "",
      compatible_machine_manufacturer_id: (() => {
        const model = masters.machineModels.find((x) => x.id === d.compatible_machine_model_id);
        return model?.manufacturer_id || "";
      })(),
      compatible_machine_model_id: d.compatible_machine_model_id || "",
      board_type_id: d.board_type_id || "",
      part_number: d.part_number || "",
      version_number: d.version_number || "",
      repaired: d.repaired == null ? "" : d.repaired ? "Yes" : "No",
      video_input: d.video_input || "",
      filter_type: d.filter_type || "",
      disk_type: d.disk_type || "",
      capacity_gb: d.capacity_gb ?? "",
      size_inches: d.size_inches ?? "",
    };
    const draft = { [field]: current[field] };
    if (field === "compatible_machine") {
      draft.compatible_machine_manufacturer_id = current.compatible_machine_manufacturer_id;
      draft.compatible_machine_model_id = current.compatible_machine_model_id;
    }
    if (field === "model_id" && item.item_type === "Machine") {
      draft.manufacturer_id = current.manufacturer_id;
    }
    if (field === "model_id" && item.item_type === "Probe") {
      draft.probe_type_id = current.probe_type_id;
    }
    setEditingField(field);
    setEditDraft(draft);
    setError("");
  }

  function cancelFieldEdit() {
    setEditingField(null);
    setEditDraft({});
    setError("");
  }

  function editValue(key) {
    return editDraft[key] ?? "";
  }

  function editSelect(options, key, placeholder = "Select") {
    return (
      <select
        value={editValue(key)}
        onChange={(event) => setEditDraft((current) => ({ ...current, [key]: event.target.value }))}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value ?? option} value={option.value ?? option}>
            {option.label ?? option}
          </option>
        ))}
      </select>
    );
  }

  function editControl(field) {
    const d = item.detail || {};
    const value = editValue(field);
    if (field === "functions") {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="item-inline-checks">
          {["4D", "Cardiac", "Elastography"].map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option]
                    : selected.filter((x) => x !== option);
                  setEditDraft((current) => ({ ...current, functions: next }));
                }}
              />
              {option}
            </label>
          ))}
        </div>
      );
    }
    if (field === "manufacturer_id") return editSelect(
      activeOrCurrent(item.item_type === "Hard Disk" ? masters.hardDiskManufacturers : masters.equipmentManufacturers, value)
        .map((x) => ({ value: x.id, label: x.name })),
      field
    );
    if (field === "model_id") {
      const list = item.item_type === "Machine"
        ? activeOrCurrent(
            masters.machineModels.filter((x) => !editValue("manufacturer_id") || x.manufacturer_id === editValue("manufacturer_id")),
            value
          )
        : activeOrCurrent(
            masters.probeModels.filter((x) =>
              (!editValue("manufacturer_id") || x.manufacturer_id === editValue("manufacturer_id")) &&
              (!editValue("probe_type_id") || x.probe_type_id === editValue("probe_type_id"))
            ),
            value
          );
      return editSelect(list.map((x) => ({ value: x.id, label: x.name })), field, "Select model");
    }
    if (field === "probe_type_id") return editSelect(
      activeOrCurrent(masters.probeTypes, value).map((x) => ({ value: x.id, label: x.name })),
      field,
      "Select probe type"
    );
    if (field === "board_type_id") return editSelect(
      activeOrCurrent(masters.boardTypes, value).map((x) => ({ value: x.id, label: x.name })),
      field,
      "Select board type"
    );
    if (field === "compatible_machine") {
      const compatibleModels = activeOrCurrent(
        masters.machineModels.filter(
          (x) => !editValue("compatible_machine_manufacturer_id") || x.manufacturer_id === editValue("compatible_machine_manufacturer_id")
        ),
        editValue("compatible_machine_model_id")
      );
      return (
        <div className="item-inline-compatible">
          {editSelect(
            activeOrCurrent(masters.equipmentManufacturers, editValue("compatible_machine_manufacturer_id"))
              .map((x) => ({ value: x.id, label: x.name })),
            "compatible_machine_manufacturer_id",
            "Select manufacturer"
          )}
          {editSelect(
            compatibleModels.map((x) => ({ value: x.id, label: x.name })),
            "compatible_machine_model_id",
            "Select machine model"
          )}
        </div>
      );
    }
    if (field === "status_id") return editSelect(
      activeOrCurrent(masters.statuses, value).map((x) => ({ value: x.id, label: x.name })),
      field,
      "Select status"
    );
    if (field === "quality_status_id") return editSelect(
      activeOrCurrent(masters.qualities, value).map((x) => ({ value: x.id, label: x.name })),
      field,
      "Select quality"
    );
    if (field === "current_location_id") return (
      <select value={value} onChange={(event) => setEditDraft({ [field]: event.target.value })}>
        <option value="">Not set</option>
        {activeOrCurrent(masters.locations, value).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    );
    if (field === "monitor_size") return editSelect(SELECT_OPTIONS.monitor_size, field, "Select size");
    if (field === "portable") return editSelect(SELECT_OPTIONS.portable, field, "Select");
    if (field === "connector_count") return editSelect(SELECT_OPTIONS.connectors, field, "Select");
    if (field === "video_input") return editSelect(SELECT_OPTIONS.video_input, field, "Select");
    if (field === "repaired") return editSelect(SELECT_OPTIONS.repaired, field, "Select");
    if (field === "filter_type") return editSelect(SELECT_OPTIONS.emi_type, field, "Select");
    if (field === "disk_type") return editSelect(SELECT_OPTIONS.hard_disk_type, field, "Select");
    if (field === "size_inches") return editSelect(['2.5"', '3.5"'], field, "Select size");
    const numeric = ["manufacturer_year", "year", "capacity_gb"].includes(field);
    return (
      <input
        type={numeric ? "number" : "text"}
        value={value}
        onChange={(event) => setEditDraft((current) => ({ ...current, [field]: event.target.value }))}
      />
    );
  }

  async function saveFieldEdit() {
    if (!editingField || savingField) return;
    setSavingField(true);
    setError("");
    const field = editingField;
    const value = editValue(field);
    const requiredFields = ["manufacturer_id", "model_id", "manufacturer_year", "connector_count", "monitor_size", "software_version", "portable", "status_id", "quality_status_id", "probe_type_id", "board_type_id", "part_number", "version_number", "repaired", "video_input", "filter_type", "disk_type", "capacity_gb", "size_inches"];
    if (requiredFields.includes(field) && (Array.isArray(value) ? value.length === 0 : String(value ?? "").trim() === "")) {
      setError("This characteristic is required.");
      setSavingField(false);
      return;
    }
    if (field === "serial_number" && String(value).trim()) {
      const { data, error: checkError } = await supabase.from("items").select("id,serial_number").not("serial_number","is",null);
      if (checkError) {
        setError("We could not verify this serial number. Please try again.");
        setSavingField(false);
        return;
      }
      const duplicate = (data || []).some((x) => x.id !== item.id && String(x.serial_number || "").trim().toLowerCase() === String(value).trim().toLowerCase());
      if (duplicate) {
        setError("This serial number is already in use. Please enter a different serial number.");
        setSavingField(false);
        return;
      }
    }

    let table = "items";
    let payload = {};
    if (["serial_number","status_id","quality_status_id","current_location_id","quality_note"].includes(field)) {
      payload[field] = field === "serial_number" ? (String(value).trim() || null) : (value || null);
    } else {
      table = detailTable(item.item_type);
      const map = {
        manufacturer_id: "manufacturer_id",
        model_id: "model_id",
        manufacturer_year: "manufacturer_year",
        functions: "functions",
        connector_count: "connector_count",
        monitor_size: item.item_type === "Monitor" ? "size" : "monitor_size",
        software_version: "software_version",
        portable: "portable",
        probe_type_id: "probe_type_id",
        year: "year",
        board_type_id: "board_type_id",
        part_number: "part_number",
        version_number: "version_number",
        repaired: "repaired",
        video_input: "video_input",
        filter_type: "filter_type",
        disk_type: "disk_type",
        capacity_gb: "capacity_gb",
        size_inches: "size_inches",
      };
      if (field === "compatible_machine") {
        payload = { compatible_machine_model_id: editValue("compatible_machine_model_id") || null };
      } else {
        payload[map[field] || field] = ["portable","repaired"].includes(field)
          ? value === "Yes"
          : ["manufacturer_year","year","connector_count","monitor_size","capacity_gb","size_inches"].includes(field)
            ? (value === "" ? null : Number(String(value).replace(/"/g, "")))
            : value;
      }
    }

    const result = await supabase.from(table).update(payload).eq(table === "items" ? "id" : "item_id", item.id);
    if (result.error) {
      setError(result.error.message || "We could not save this characteristic.");
      setSavingField(false);
      return;
    }
    setSavingField(false);
    setEditingField(null);
    setEditDraft({});
    await load();
    await loadComponents();
  }

  function fields() {
    const d = item.detail || {};
    const base = [
      { key:"serial_number", label:"Serial number", value:item.serial_number || "—" },
      { key:"status_id", label:"Status", value:statusValue, readOnly:Boolean(parentMachine) },
      ...(parentMachine ? [{ key:"parent_machine", label:"Parent machine", value:<button type="button" className="inline-machine-link" onClick={() => onItemClick?.(parentMachine.id)}>{parentMachine.serial_number || "Machine"}</button>, readOnly:true }] : []),
      { key:"quality_status_id", label:"Quality", value:name(masters.qualities, item.quality_status_id) },
      { key:"current_location_id", label:"Location", value:name(masters.locations, item.current_location_id) },
    ];
    const specific = {
      Machine: [
        {key:"manufacturer_id",label:"Manufacturer",value:name(masters.equipmentManufacturers,d.manufacturer_id)},
        {key:"model_id",label:"Model",value:name(masters.machineModels,d.model_id)},
        {key:"manufacturer_year",label:"Manufacturer year",value:d.manufacturer_year ?? "—"},
        {key:"functions",label:"Functions",value:Array.isArray(d.functions)&&d.functions.length?d.functions.join(", "):"—"},
        {key:"connector_count",label:"Number of connectors",value:d.connector_count ?? "—"},
        {key:"monitor_size",label:"Monitor size",value:d.monitor_size == null ? "—" : d.monitor_size + String.fromCharCode(34)},
        {key:"software_version",label:"Software version",value:d.software_version || "—"},
        {key:"portable",label:"Portable",value:d.portable == null ? "—" : d.portable ? "Yes" : "No"},
      ],
      Probe: [
        {key:"manufacturer_id",label:"Manufacturer",value:name(masters.equipmentManufacturers,d.manufacturer_id)},
        {key:"probe_type_id",label:"Probe type",value:name(masters.probeTypes,d.probe_type_id)},
        {key:"model_id",label:"Model",value:name(masters.probeModels,d.model_id)},
        {key:"year",label:"Year",value:d.year ?? "—"},
      ],
      Board: [
        {key:"compatible_machine",label:"Compatible machine",value:compatibleName(d.compatible_machine_model_id)},
        {key:"board_type_id",label:"Board type",value:name(masters.boardTypes,d.board_type_id)},
        {key:"part_number",label:"Part number",value:d.part_number || "—"},
        {key:"version_number",label:"Version number",value:d.version_number || "—"},
        {key:"repaired",label:"Repaired",value:d.repaired == null ? "—" : d.repaired ? "Yes" : "No"},
      ],
      PSU: [{key:"compatible_machine",label:"Compatible machine",value:compatibleName(d.compatible_machine_model_id)}],
      Monitor: [
        {key:"compatible_machine",label:"Compatible machine",value:compatibleName(d.compatible_machine_model_id)},
        {key:"monitor_size",label:"Size",value:d.size == null ? "—" : d.size + String.fromCharCode(34)},
        {key:"video_input",label:"Video input",value:d.video_input || "—"},
      ],
      "EMI Filter": [{key:"filter_type",label:"Type",value:d.filter_type || "—"}],
      "Hard Disk": [
        {key:"manufacturer_id",label:"Manufacturer",value:name(masters.hardDiskManufacturers,d.manufacturer_id)},
        {key:"disk_type",label:"Type",value:d.disk_type || "—"},
        {key:"capacity_gb",label:"Capacity",value:d.capacity_gb == null ? "—" : d.capacity_gb + " GB"},
        {key:"size_inches",label:"Size",value:d.size_inches == null ? "—" : d.size_inches + String.fromCharCode(34)},
        {key:"compatible_machine",label:"Compatible machine",value:d.compatible_machine_model_id ? compatibleName(d.compatible_machine_model_id) : "—"},
        {key:"software_version",label:"Software version",value:d.software_version || "—"},
      ],
      Keyboard: [{key:"compatible_machine",label:"Compatible machine",value:compatibleName(d.compatible_machine_model_id)}],
    };
    return [...(specific[item.item_type] || []), ...base];
  }

  async function addComponent() {
    if (!canEdit || !selectedComponentId || addingComponent) return;
    setAddingComponent(true);
    setComponentError("");
    const result = await supabase.from("machine_components").insert({
      machine_item_id: item.id,
      component_item_id: selectedComponentId,
    });
    if (result.error) {
      setComponentError(result.error.code === "23505"
        ? "This component is already installed in a machine."
        : (result.error.message || "We could not add this component."));
      setAddingComponent(false);
      return;
    }
    setSelectedComponentId("");
    setShowComponentPicker(false);
    setAddingComponent(false);
    await load();
    await loadComponents();
  }

  async function removeComponent(link) {
    if (!canEdit || removingComponentId) return;
    if (!window.confirm("Remove this component from the machine? Its status will become Idle.")) return;
    setRemovingComponentId(link.component_item_id);
    setComponentError("");
    const result = await supabase.from("machine_components").delete().eq("id", link.id);
    if (result.error) {
      setComponentError(result.error.message);
      setRemovingComponentId("");
      return;
    }
    setRemovingComponentId("");
    await load();
    await loadComponents();
  }

  async function remove() {
    if (!canDelete || deleting) return;
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    setDeleting(true);
    setError("");
    const table = detailTable(item.item_type);
    const detailResult = await supabase.from(table).delete().eq("item_id", item.id);
    if (detailResult.error) {
      setError(detailResult.error.message);
      setDeleting(false);
      return;
    }
    const itemResult = await supabase.from("items").delete().eq("id", item.id);
    if (itemResult.error) {
      setError(itemResult.error.message);
      setDeleting(false);
      return;
    }
    setDeleting(false);
    onDeleted();
  }

  if (loading) return <section className="content-card item-page-shell"><div className="modal-loading">Loading item...</div></section>;
  if (!item) return <section className="content-card item-page-shell"><div className="error-message">{error || "Item not found."}</div><div className="modal-actions"><button className="secondary-button" onClick={onBack}>Back to Global Stock</button></div></section>;

  const componentGroups = componentTypes.map((type) => ({
    type,
    rows: components.filter((x) => x.item?.item_type === type),
  }));
  const selectedTypeRows = componentGroups.find((x) => x.type === componentType)?.rows || [];
  const hasSingleComponent = componentType === "Monitor" || componentType === "Keyboard";
  const singleAlreadyInstalled = hasSingleComponent && selectedTypeRows.length > 0;

  return (
    <section className="content-card item-page-shell">
      <div className="item-detail-card item-page-card">
        <div className="item-detail-header">
          <div>
            <p className="section-kicker">{item.item_type.toUpperCase()}</p>
            <h2>{item.serial_number || "Item details"}</h2>
            <p>Inventory item · {item.item_type}</p>
          </div>
          <div className="item-detail-actions">
            <button className="secondary-button" onClick={onBack}>Back to Global Stock</button>
            {canDelete && <button className="cancel-button" onClick={remove} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</button>}
          </div>
        </div>
        <div className="item-detail-body">
          <div className="item-machine-top">
            <div className="item-photo-placeholder"><div><span className="photo-placeholder-icon">▧</span><strong>Item photo</strong><span>Photo support will be added later.</span></div></div>
            {item.item_type === "Machine" && <div className="machine-components-panel">
              <div className="machine-components-header">
                <div><span className="section-kicker">INSTALLED COMPONENTS</span><h3>Components</h3><p>Components currently installed in this machine.</p></div>
                {canEdit && <button className="primary-button" onClick={() => { setShowComponentPicker((v) => !v); setComponentError(""); }}>+ Add component</button>}
              </div>
              {showComponentPicker && canEdit && <div className="machine-component-picker">
                <div className="machine-component-picker-grid">
                  <label className="redesign-field"><span>Component type</span>
                    <select value={componentType} onChange={(e) => { setComponentType(e.target.value); setSelectedComponentId(""); }}>
                      {componentTypes.map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="redesign-field"><span>Global stock component</span>
                    <select value={selectedComponentId} onChange={(e) => setSelectedComponentId(e.target.value)} disabled={componentsLoading || singleAlreadyInstalled}>
                      <option value="">{componentsLoading ? "Loading..." : singleAlreadyInstalled ? "Already installed" : availableComponents.length ? "Select component" : "No Idle components available"}</option>
                      {availableComponents.map((component) => <option key={component.id} value={component.id}>{component.serial_number || "No serial number"} · {component.item_type}</option>)}
                    </select>
                  </label>
                </div>
                <div className="machine-component-picker-actions">
                  <button className="secondary-button" onClick={() => { setShowComponentPicker(false); setSelectedComponentId(""); }}>Cancel</button>
                  <button className="primary-button" onClick={addComponent} disabled={!selectedComponentId || addingComponent || singleAlreadyInstalled}>{addingComponent ? "Adding..." : "Add component"}</button>
                </div>
              </div>}
              {componentError && <div className="error-message">{componentError}</div>}
              {componentsLoading ? <div className="machine-components-empty">Loading components...</div> : (
                <div className="machine-components-list">
                  {componentGroups.filter((group) => group.rows.length > 0).map((group) => (
                    <div className="machine-component-group" key={group.type}>
                      <div className="machine-component-group-header"><strong>{group.type}</strong><span>{group.rows.length}</span></div>
                      {group.rows.map((link) => (
                        <div className="machine-component-row" key={link.id}>
                          <button type="button" className="machine-component-open" onClick={() => onItemClick?.(link.component_item_id)}>
                            <strong>{link.item?.serial_number || "No serial number"}</strong><span>{componentDisplay(link)}</span>
                          </button>
                          {canEdit && <button className="table-button delete-button" onClick={() => removeComponent(link)} disabled={removingComponentId === link.component_item_id}>{removingComponentId === link.component_item_id ? "Removing..." : "Remove"}</button>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>
          <div className="item-detail-grid">{fields().map((field) => (
            <div className="item-detail-field" key={field.key}>
              <div className="item-detail-field-head"><span>{field.label}</span>{canEdit && !field.readOnly && <button type="button" className="inline-edit-button" onClick={() => beginFieldEdit(field.key)} disabled={editingField && editingField !== field.key}>Edit</button>}</div>
              {editingField === field.key ? (
                <div className="item-inline-editor">
                  {field.key === "compatible_machine"
                    ? editControl(field.key)
                    : editControl(field.key)}
                  <div className="item-inline-editor-actions">
                    <button type="button" className="secondary-button" onClick={cancelFieldEdit} disabled={savingField}>Cancel</button>
                    <button type="button" className="primary-button" onClick={saveFieldEdit} disabled={savingField}>{savingField ? "Saving..." : "Save"}</button>
                  </div>
                </div>
              ) : <strong>{field.value}</strong>}
            </div>
          ))}</div>
          <div className="item-detail-notes"><div><div className="item-detail-field-head"><span>Quality note</span>{canEdit && <button type="button" className="inline-edit-button" onClick={() => beginFieldEdit("quality_note")} disabled={editingField && editingField !== "quality_note"}>Edit</button>}</div>{editingField === "quality_note" ? <div className="item-inline-editor"><textarea value={editValue("quality_note")} onChange={(event) => setEditDraft({quality_note:event.target.value})} rows="4" /><div className="item-inline-editor-actions"><button type="button" className="secondary-button" onClick={cancelFieldEdit} disabled={savingField}>Cancel</button><button type="button" className="primary-button" onClick={saveFieldEdit} disabled={savingField}>{savingField ? "Saving..." : "Save"}</button></div></div> : <p>{item.quality_note || "No quality note."}</p>}</div></div>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    </section>
  );
}

export function RedesignedGlobalStock({ supabase, canEdit, onItemClick }) {
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
      supabase.from("machine_models").select("id,name,manufacturer_id").order("name"),
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
    if (key==="compatible_machine") {
      const model = masters.machineModels.find(x=>x.id===d.compatible_machine_model_id);
      const manufacturer = masters.equipmentManufacturers.find(x=>x.id===model?.manufacturer_id)?.name;
      return manufacturer && model?.name ? manufacturer + " " + model.name : model?.name || manufacturer || "—";
    }
    if (key==="probe_type") return masters.probeTypes.find(x=>x.id===d.probe_type_id)?.name || "—";
    if (key==="board_type") return masters.boardTypes.find(x=>x.id===d.board_type_id)?.name || "—";
    if (key==="functions") return Array.isArray(d.functions)?d.functions.join(", "):"—";
    if (key==="portable") return d.portable == null ? "—" : d.portable ? "Yes":"No";
    if (key==="connectors") return d.connector_count ?? "—";
    if (key==="manufacturer_year") return d.manufacturer_year ?? "—";
    if (key==="year") return d.year ?? "—";
    if (key==="monitor_size") return d.monitor_size == null && d.size == null ? "—" : (d.monitor_size ?? d.size) + String.fromCharCode(34);
    if (key==="software_version") return d.software_version || "—";
    if (key==="repaired") return d.repaired == null ? "—" : d.repaired ? "Yes":"No";
    if (key==="emi_type") return d.filter_type || "—";
    if (key==="capacity_gb") return d.capacity_gb == null ? "—" : d.capacity_gb + " GB";
    if (key==="size_inches") return d.size_inches == null ? "—" : d.size_inches + String.fromCharCode(34);
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
        {filtered.map(item=><tr key={item.id} className="stock-row-clickable" onClick={() => onItemClick?.(item.id)}><td><strong>{item.serial_number||"—"}</strong></td>{columns.map(c=><td key={c}>{display(item,c)}</td>)}<td>{masters.statuses.find(x=>x.id===item.status_id)?.name||"—"}</td><td>{masters.qualities.find(x=>x.id===item.quality_status_id)?.name||"—"}</td><td>{masters.locations.find(x=>x.id===item.current_location_id)?.name||"—"}</td></tr>)}
      </tbody></table></div>
      {showAdd && <ItemForm supabase={supabase} type={activeType} onClose={()=>setShowAdd(false)} onSaved={async()=>{setShowAdd(false);await loadItems();}} />}
    </section>
  );
}

export function RedesignedMasterData({ supabase, canEdit, activeKey, onActiveChange }) {
  const [active, setActive] = useState(() => MASTER_GROUPS.find((group) => group.key === activeKey) || MASTER_GROUPS[0]);
  const [rows, setRows] = useState([]);
  const [refs, setRefs] = useState([]);
  const [form, setForm] = useState({name:"",manufacturer_id:"",probe_type_id:"",compatible_machine_model_ids:[]});
  const [compatibilityManufacturerId, setCompatibilityManufacturerId] = useState("");
  const [compatibilitySearch, setCompatibilitySearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const select = active.manufacturer && active.probeType
      ? "id,name,manufacturer_id,probe_type_id,is_active"
      : active.manufacturer
        ? "id,name,manufacturer_id,is_active"
        : active.probeType
          ? "id,name,probe_type_id,is_active"
          : "id,name,is_active";
    const result = await supabase.from(active.table).select(select).order("name");
    if (result.error) {
      setError(result.error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(result.data || []);

    if (active.key === "probe_models") {
      const [manufacturerResult, probeTypeResult, machineModelResult, compatibilityResult] = await Promise.all([
        supabase.from("equipment_manufacturers").select("id,name,is_active").order("name"),
        supabase.from("probe_types").select("id,name,is_active").order("name"),
        supabase.from("machine_models").select("id,name,manufacturer_id,is_active").order("name"),
        supabase.from("probe_model_machine_models").select("probe_model_id,machine_model_id"),
      ]);
      const failedRef = [manufacturerResult, probeTypeResult, machineModelResult, compatibilityResult].find((r) => r.error);
      if (failedRef) setError(failedRef.error.message);
      else setRefs({
        manufacturers: manufacturerResult.data || [],
        probeTypes: probeTypeResult.data || [],
        machineModels: machineModelResult.data || [],
        compatibilities: compatibilityResult.data || [],
      });
    } else if (active.manufacturer && active.probeType) {
      const [manufacturerResult, probeTypeResult] = await Promise.all([
        supabase.from("equipment_manufacturers").select("id,name,is_active").order("name"),
        supabase.from("probe_types").select("id,name,is_active").order("name"),
      ]);
      if (manufacturerResult.error) setError(manufacturerResult.error.message);
      else if (probeTypeResult.error) setError(probeTypeResult.error.message);
      else setRefs({ manufacturers: manufacturerResult.data || [], probeTypes: probeTypeResult.data || [] });
    } else if (active.manufacturer) {
      const r = await supabase.from("equipment_manufacturers").select("id,name,is_active").order("name");
      if (r.error) setError(r.error.message);
      else setRefs(r.data || []);
    } else if (active.probeType) {
      const r = await supabase.from("probe_types").select("id,name,is_active").order("name");
      if (r.error) setError(r.error.message);
      else setRefs(r.data || []);
    } else {
      setRefs([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    const next = MASTER_GROUPS.find((group) => group.key === activeKey);
    if (next && next.key !== active.key) {
      setActive(next);
      setRefs(next.manufacturer && next.probeType ? {manufacturers:[],probeTypes:[]} : []);
      setEditing(null);
      setError("");
    }
  }, [activeKey]);

  useEffect(() => { load(); }, [active.table]);

  function chooseCategory(group) {
    setActive(group);
    setRefs(group.manufacturer && group.probeType ? {manufacturers:[],probeTypes:[]} : []);
    setEditing(null);
    setError("");
    onActiveChange?.(group.key);
  }

  function begin(row=null) {
    setEditing(row ? row.id : "new");
    setForm({
      name: row?.name || "",
      manufacturer_id: row?.manufacturer_id || "",
      probe_type_id: row?.probe_type_id || "",
      compatible_machine_model_ids: row
        ? (refs.compatibilities || []).filter((x) => x.probe_model_id === row.id).map((x) => x.machine_model_id)
        : [],
    });
    const assignedMachineModelIds = row
      ? (refs.compatibilities || []).filter((x) => x.probe_model_id === row.id).map((x) => x.machine_model_id)
      : [];
    const firstAssignedModel = (refs.machineModels || []).find((x) => assignedMachineModelIds.includes(x.id));
    setCompatibilityManufacturerId(firstAssignedModel?.manufacturer_id || "");
    setCompatibilitySearch("");
    setError("");
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    if (!form.name.trim()) {
      setError("Name is required.");
      setSaving(false);
      return;
    }
    if (active.manufacturer && !form.manufacturer_id) {
      setError("Manufacturer is required.");
      setSaving(false);
      return;
    }
    if (active.probeType && !form.probe_type_id) {
      setError("Probe type is required.");
      setSaving(false);
      return;
    }
    if (active.key === "probe_models") {
      const selectedCompatibility = form.compatible_machine_model_ids || [];
      const existingCompatibilityCount = editing === "new"
        ? 0
        : (refs.compatibilities || []).filter((x) => x.probe_model_id === editing).length;
      if (selectedCompatibility.length > 8) {
        setError("A Probe Model can support a maximum of 8 Machine Models.");
        setSaving(false);
        return;
      }
      if (selectedCompatibility.length === 0 && (editing === "new" || existingCompatibilityCount > 0)) {
        setError("At least 1 compatible Machine Model is required.");
        setSaving(false);
        return;
      }
    }

    const payload = {
      name: form.name.trim(),
      ...(active.manufacturer ? {manufacturer_id: form.manufacturer_id} : {}),
      ...(active.probeType ? {probe_type_id: form.probe_type_id} : {}),
    };
    let savedId = editing;
    const result = editing === "new"
      ? await supabase.from(active.table).insert(payload).select("id").single()
      : await supabase.from(active.table).update(payload).eq("id", editing);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    if (active.key === "probe_models") {
      savedId = editing === "new" ? result.data?.id : editing;
      const selectedCompatibility = form.compatible_machine_model_ids || [];
      const existingCompatibility = (refs.compatibilities || [])
        .filter((x) => x.probe_model_id === savedId)
        .map((x) => x.machine_model_id);
      const additions = selectedCompatibility.filter((id) => !existingCompatibility.includes(id));
      const removals = existingCompatibility.filter((id) => !selectedCompatibility.includes(id));

      if (additions.length) {
        const compatibilityInsert = await supabase.from("probe_model_machine_models").insert(
          additions.map((machineModelId) => ({
            probe_model_id: savedId,
            machine_model_id: machineModelId,
          }))
        );
        if (compatibilityInsert.error) {
          if (editing === "new") await supabase.from("probe_models").delete().eq("id", savedId);
          setError(compatibilityInsert.error.message);
          setSaving(false);
          return;
        }
      }

      if (removals.length) {
        const compatibilityDelete = await supabase.from("probe_model_machine_models")
          .delete()
          .eq("probe_model_id", savedId)
          .in("machine_model_id", removals);
        if (compatibilityDelete.error) {
          setError(compatibilityDelete.error.message);
          setSaving(false);
          return;
        }
      }
    }

    setSaving(false);
    setEditing(null);
    setForm({name:"",manufacturer_id:"",probe_type_id:"",compatible_machine_model_ids:[]});
    setCompatibilityManufacturerId("");
    setCompatibilitySearch("");
    await load();
  }

  async function toggleActive(row) {
    if (!canEdit) return;
    setError("");
    const result = await supabase.from(active.table)
      .update({ is_active: row.is_active === false })
      .eq("id", row.id);
    if (result.error) {
      setError(result.error.message || "We could not change the active status. Please try again.");
      return;
    }
    await load();
  }

  async function remove(row) {
    if (!canEdit) return;
    if (!window.confirm('Delete "' + row.name + '"? This cannot be undone.')) return;
    setError("");
    const result = await supabase.from(active.table).delete().eq("id", row.id);
    if (result.error) {
      setError(result.error.code === "23503"
        ? "This record is still referenced by existing data and cannot be deleted."
        : (result.error.message || "We could not delete this record. Please try again."));
      await load();
      return;
    }
    await load();
  }

  return (
    <section className="master-card redesign-master">
      <div className="master-header">
        <div><p className="section-kicker">ADMINISTRATION</p><h2>Master Data</h2><p>Item types are fixed. Manage only the reusable reference data required by the IMS.</p></div>
      </div>
      <div className="master-content">
        <div className="master-content-title">
          <div><strong>{active.label}</strong><span>{rows.length} record{rows.length===1?"":"s"}</span></div>
          <button className="primary-button" onClick={()=>begin()} disabled={!canEdit}>+ Add</button>
        </div>
        {editing && <form className="master-edit-form" onSubmit={save}>
          <div className="master-form-field"><label>Name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} autoFocus /></div>
          {active.manufacturer && <div className="master-form-field"><label>Manufacturer</label><Select value={form.manufacturer_id} onChange={e=>setForm({...form,manufacturer_id:e.target.value})} options={activeOrCurrent(active.probeType ? refs.manufacturers : refs, form.manufacturer_id).map(x=>({value:x.id,label:x.name}))} required /></div>}
          {active.probeType && <div className="master-form-field"><label>Probe Type</label><Select value={form.probe_type_id} onChange={e=>setForm({...form,probe_type_id:e.target.value})} options={activeOrCurrent(active.manufacturer ? refs.probeTypes : refs, form.probe_type_id).map(x=>({value:x.id,label:x.name}))} placeholder="Select probe type" required /></div>}
          {active.key === "probe_models" && <div className="master-form-field master-compatibility-field">
            <div className="master-compatibility-heading">
              <div>
                <label>Compatible Machine Models {editing === "new" ? "*" : "(existing records may be assigned later)"}</label>
                <small className="master-form-hint">Choose a manufacturer first, then select compatible models. Selected models are kept even when you change the filter.</small>
              </div>
              <span className="master-compatibility-count">{(form.compatible_machine_model_ids || []).length} / 8 selected</span>
            </div>

            <div className="master-compatibility-controls">
              <div className="master-compatibility-filter">
                <label>Manufacturer</label>
                <Select
                  value={compatibilityManufacturerId}
                  onChange={(e) => {
                    setCompatibilityManufacturerId(e.target.value);
                    setCompatibilitySearch("");
                  }}
                  options={activeOrCurrent(refs.manufacturers || [], compatibilityManufacturerId).map((x) => ({value:x.id,label:x.name}))}
                  placeholder="Select manufacturer first"
                />
              </div>
              <div className="master-compatibility-filter">
                <label>Search machine models</label>
                <input
                  value={compatibilitySearch}
                  onChange={(e) => setCompatibilitySearch(e.target.value)}
                  placeholder={compatibilityManufacturerId ? "Search models..." : "Select a manufacturer first"}
                  disabled={!compatibilityManufacturerId}
                />
              </div>
            </div>

            <div className="master-compatibility-layout">
              <div className="master-compatibility-available">
                <div className="master-compatibility-section-title">Available Machine Models</div>
                <div className="master-compatibility-list">
                  {!compatibilityManufacturerId && <div className="master-compatibility-empty">Select a manufacturer to view its machine models.</div>}
                  {compatibilityManufacturerId && (() => {
                    const search = compatibilitySearch.trim().toLowerCase();
                    const models = activeOrCurrent(refs.machineModels || [], form.compatible_machine_model_ids || [])
                      .filter((model) => model.manufacturer_id === compatibilityManufacturerId)
                      .filter((model) => !search || model.name.toLowerCase().includes(search));
                    return models.length ? models.map((machineModel) => {
                      const selected = (form.compatible_machine_model_ids || []).includes(machineModel.id);
                      return <label key={machineModel.id} className={selected ? "master-compatibility-option selected" : "master-compatibility-option"}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!selected && (form.compatible_machine_model_ids || []).length >= 8}
                          onChange={(e) => setForm((current) => ({
                            ...current,
                            compatible_machine_model_ids: e.target.checked
                              ? [...(current.compatible_machine_model_ids || []), machineModel.id]
                              : (current.compatible_machine_model_ids || []).filter((id) => id !== machineModel.id),
                          }))}
                        />
                        <span className="master-compatibility-model-name">{machineModel.name}</span>
                        {machineModel.is_active === false && <span className="master-compatibility-inactive">Inactive</span>}
                      </label>;
                    }) : <div className="master-compatibility-empty">No machine models match this manufacturer and search.</div>;
                  })()}
                </div>
              </div>

              <div className="master-compatibility-selected">
                <div className="master-compatibility-section-title">Selected Machine Models</div>
                <div className="master-selected-model-list">
                  {(form.compatible_machine_model_ids || []).length === 0 && <div className="master-compatibility-empty">No compatible machine models selected.</div>}
                  {(form.compatible_machine_model_ids || []).map((modelId) => {
                    const machineModel = (refs.machineModels || []).find((x) => x.id === modelId);
                    const manufacturer = machineModel ? (refs.manufacturers || []).find((x) => x.id === machineModel.manufacturer_id) : null;
                    if (!machineModel) return null;
                    return <div key={modelId} className="master-selected-model">
                      <div>
                        <strong>{machineModel.name}</strong>
                        <span>{manufacturer?.name || "Manufacturer unavailable"}{machineModel.is_active === false ? " · Inactive" : ""}</span>
                      </div>
                      <button
                        type="button"
                        className="master-selected-model-remove"
                        onClick={() => setForm((current) => ({
                          ...current,
                          compatible_machine_model_ids: (current.compatible_machine_model_ids || []).filter((id) => id !== modelId),
                        }))}
                        aria-label={"Remove " + machineModel.name}
                      >×</button>
                    </div>;
                  })}
                </div>
              </div>
            </div>
          </div>}
          <div className="master-form-actions"><button type="button" className="secondary-button" onClick={()=>setEditing(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?"Saving...":"Save"}</button></div>
        </form>}
        {error&&<div className="error-message master-error">{error}</div>}
        <div className="master-table-wrap">
          <table className="master-table">
            <thead><tr><th>Name</th>{active.manufacturer&&<th>Manufacturer</th>}{active.probeType&&<th>Probe Type</th>}{active.key === "probe_models"&&<th>Compatible Machine Models</th>}<th>Active</th><th>Action</th></tr></thead>
            <tbody>
              {!loading&&rows.length===0&&<tr><td colSpan={(active.manufacturer?1:0)+(active.probeType?1:0)+(active.key==="probe_models"?1:0)+3} className="empty-cell">No records found.</td></tr>}
              {rows.map(row=><tr key={row.id}>
                <td><strong>{row.name}</strong></td>
                {active.manufacturer&&<td>{(active.probeType ? refs.manufacturers : refs).find(x=>x.id===row.manufacturer_id)?.name||"—"}</td>}
                {active.probeType&&<td>{(active.manufacturer ? refs.probeTypes : refs).find(x=>x.id===row.probe_type_id)?.name||"—"}</td>}
                {active.key === "probe_models" && <td>
                  {(() => {
                    const compatibleIds = (refs.compatibilities || []).filter((x) => x.probe_model_id === row.id).map((x) => x.machine_model_id);
                    const names = compatibleIds.map((id) => {
                      const model = (refs.machineModels || []).find((x) => x.id === id);
                      const manufacturer = model ? (refs.manufacturers || []).find((x) => x.id === model.manufacturer_id) : null;
                      return model ? (manufacturer ? manufacturer.name + " " : "") + model.name : null;
                    }).filter(Boolean);
                    return names.length ? names.join(", ") : "Not assigned";
                  })()}
                </td>}
                <td>
                  <button
                    type="button"
                    className={row.is_active === false ? "master-status-toggle inactive" : "master-status-toggle active"}
                    onClick={() => toggleActive(row)}
                    disabled={!canEdit}
                    title={canEdit ? "Click to change active status" : "Only admins can change master data status"}
                  >
                    {row.is_active === false ? "Inactive" : "Active"}
                  </button>
                </td>
                <td><div className="row-actions"><button className="table-button" onClick={()=>begin(row)} disabled={!canEdit}>Edit</button><button className="table-button delete-button" onClick={()=>remove(row)} disabled={!canEdit} title={canEdit?"Delete":"Only admins can delete master data"}>Delete</button></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}