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

function GlobalStock({ supabase }) {
  const [items, setItems] = useState([]);
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
        <button className="secondary-button" onClick={loadItems} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
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
              <tr key={item.id}>
                <td><strong>{item.serial_number || "—"}</strong></td>
                <td>{item.item_types?.name || "—"}</td>
                <td>
                  <strong>{item.manufacturers?.name || "—"}</strong>
                  <span className="table-subtext">{item.models?.name || "Model not set"}</span>
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
          <GlobalStock supabase={supabase} />
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
