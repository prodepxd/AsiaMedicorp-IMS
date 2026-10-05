import { useMemo, useState } from "react";

const navItems = [
  { label: "Global Stock", icon: "▦" },
  { label: "Purchases", icon: "↘" },
  { label: "Shipments", icon: "⇄" },
  { label: "Sales", icon: "↗" },
  { label: "Admin / Master Data", icon: "⚙" },
];

const filters = [
  { label: "Item Type", options: ["All types", "Machine", "Probe", "PCB"] },
  { label: "Status", options: ["All statuses", "In Stock", "In Transit", "Sold"] },
  { label: "Quality", options: ["All quality", "Good", "Defective"] },
  { label: "Location", options: ["All locations"] },
];

function App() {
  const [active, setActive] = useState("Global Stock");
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState(
    Object.fromEntries(filters.map(({ label, options }) => [label, options[0]]))
  );

  const summary = useMemo(
    () => [
      ["Total Items", "—", "Waiting for database access"],
      ["In Stock", "—", "Current inventory"],
      ["In Transit", "—", "Active shipments"],
      ["Defective", "—", "Quality attention"],
    ],
    []
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
          {navItems.map((item) => (
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
          <span>Asia Medicorp IMS · V1</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">INVENTORY MANAGEMENT SYSTEM</p>
            <h1>{active}</h1>
          </div>
          <div className="connection-pill">
            <span className="status-dot" />
            Database connection pending
          </div>
        </header>

        <section className="summary-grid">
          {summary.map(([title, value, note]) => (
            <article className="summary-card" key={title}>
              <span>{title}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </article>
          ))}
        </section>

        <section className="content-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">GLOBAL STOCK</p>
              <h2>All current inventory</h2>
              <p>
                Search and filter the complete inventory once authorized database
                access is enabled.
              </p>
            </div>
            <button className="primary-button" type="button">
              + Add Item
            </button>
          </div>

          <div className="toolbar">
            <label className="search-box">
              <span>⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search serial number, detail, manufacturer or model..."
              />
            </label>

            {filters.map(({ label, options }) => (
              <select
                key={label}
                value={filterValues[label]}
                onChange={(event) =>
                  setFilterValues((current) => ({
                    ...current,
                    [label]: event.target.value,
                  }))
                }
                aria-label={label}
              >
                {options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ))}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Serial Number</th>
                  <th>Type</th>
                  <th>Manufacturer</th>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan="7">
                    <div className="empty-state">
                      <div className="empty-icon">▦</div>
                      <strong>No inventory loaded yet</strong>
                      <span>
                        The Global Stock screen is ready. We will connect it to
                        Supabase after authentication and access policies are
                        configured.
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
