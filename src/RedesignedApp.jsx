import React, { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { RedesignedGlobalStock, RedesignedMasterData, RedesignedItemView, MASTER_GROUPS } from "./inventory/RedesignedInventory";
import TransitModule from "./transit/TransitModule";

class WorkspaceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "An unexpected error occurred." };
  }

  componentDidCatch(error, info) {
    console.error("IMS workspace error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return <section className="content-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">WORKSPACE ERROR</p>
            <h2>The workspace hit an unexpected error</h2>
            <p>{this.state.message}</p>
            <button className="primary-button" onClick={() => this.setState({ hasError: false, message: "" })}>Try again</button>
          </div>
        </div>
      </section>;
    }
    return this.props.children;
  }
}

const navItems = [
  { label: "Global Stock", icon: "▦" },
  { label: "Transit", icon: "⇄" },
  { label: "Admin / Master Data", icon: "⚙", adminOnly: true },
];

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else if (!data.session) setError("Sign-in succeeded, but no active session was returned.");
    else await onLogin(data.session);
    setBusy(false);
  }

  return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">AM</div><p className="eyebrow">ASIA MEDICORP</p>
    <h1>Inventory Management System</h1><p className="login-copy">Sign in to access the secure inventory workspace.</p>
    <form onSubmit={submit} className="login-form">
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
      {error && <div className="error-message">{error}</div>}
      <button className="primary-button login-button" disabled={busy}>{busy?"Signing in...":"Sign in"}</button>
    </form>
    <p className="login-footer">Access is controlled by your assigned IMS role.</p>
  </section></main>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("Global Stock");
  const [masterCategory, setMasterCategory] = useState(MASTER_GROUPS[0].key);
  const [transitCategory, setTransitCategory] = useState("active");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async (userId) => {
    const { data, error: profileError } = await supabase.from("profiles")
      .select("id,full_name,role,is_active").eq("id", userId).single();
    if (profileError) { setError(profileError.message); return false; }
    if (!data.is_active) { await supabase.auth.signOut(); setError("Your IMS account is inactive."); return false; }
    setProfile(data); setError(""); return true;
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return; }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session) { setSession(data.session); await loadProfile(data.session.user.id); }
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      if (!next) setProfile(null);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  async function login(next) {
    setSession(next);
    const ok = await loadProfile(next.user.id);
    if (!ok) throw new Error("The account signed in, but its IMS profile could not be loaded.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setActive("Global Stock"); setMasterCategory(MASTER_GROUPS[0].key); setSelectedItemId(null);
  }

  if (!supabaseConfigured) return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">AM</div><p className="eyebrow">CONFIGURATION REQUIRED</p>
    <h1>Supabase connection is not configured.</h1>
    <p className="login-copy">Check the GitHub Actions repository secrets and redeploy.</p>
  </section></main>;

  if (loading) return <main className="login-shell"><section className="login-card loading-card">
    <div className="brand-mark">AM</div><p>Loading secure workspace...</p>
  </section></main>;

  if (!session || !profile) return <Login onLogin={login} />;

  const visibleNav = navItems.filter(x => !x.adminOnly || profile.role === "admin");

  return <div className="ims-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">AM</div><div><strong>ASIA MEDICORP</strong><span>Inventory Management</span></div></div>
      <nav className="nav"><p className="nav-title">WORKSPACE</p>
        {visibleNav.map(item=><div key={item.label} className="nav-group">
          <button
            className={(active===item.label || (item.label === "Transit" && active.startsWith("Transit")))?"nav-item active":"nav-item"}
            onClick={()=>{
              setActive(item.label);
              setSelectedItemId(null);
              if (item.label === "Admin / Master Data") setMasterCategory((current) => current || MASTER_GROUPS[0].key);
              if (item.label === "Transit") setTransitCategory("active");
            }}
          >
            <span>{item.icon}</span>{item.label}
          </button>
          {item.label === "Admin / Master Data" && active === "Admin / Master Data" && (
            <div className="nav-submenu">
              {MASTER_GROUPS.map((group) => (
                <button
                  key={group.key}
                  className={masterCategory === group.key ? "nav-subitem active" : "nav-subitem"}
                  onClick={() => {
                    setActive("Admin / Master Data");
                    setMasterCategory(group.key);
                    setSelectedItemId(null);
                  }}
                >
                  {group.label}
                </button>
              ))}
            </div>
          )}
          {item.label === "Transit" && active.startsWith("Transit") && (
            <div className="nav-submenu">
              <button
                className={transitCategory === "active" ? "nav-subitem active" : "nav-subitem"}
                onClick={() => {
                  setActive("Transit / Active Transits");
                  setTransitCategory("active");
                  setSelectedItemId(null);
                }}
              >
                Active Transits
              </button>
              <button
                className={transitCategory === "past" ? "nav-subitem active" : "nav-subitem"}
                onClick={() => {
                  setActive("Transit / Past Transits");
                  setTransitCategory("past");
                  setSelectedItemId(null);
                }}
              >
                Past Transits
              </button>
            </div>
          )}
        </div>)}
      </nav>
      <div className="sidebar-footer"><div className="secure-badge">● Secure workspace</div><span>{profile.role.toUpperCase()} access</span></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><p className="eyebrow">INVENTORY MANAGEMENT SYSTEM</p><h1>{active}</h1></div>
        <div className="user-area"><div><strong>{profile.full_name || session.user.email}</strong><span>{profile.role}</span></div><button className="signout-button" onClick={signOut}>Sign out</button></div>
      </header>
      {error && <div className="error-message">{error}</div>}
      <WorkspaceErrorBoundary key={active + ":" + (selectedItemId || "")}>
        {active==="Global Stock" && !selectedItemId && <RedesignedGlobalStock supabase={supabase} canEdit={profile.role==="admin" || profile.role==="manager"} onItemClick={setSelectedItemId} />}
        {active==="Global Stock" && selectedItemId && <RedesignedItemView supabase={supabase} itemId={selectedItemId} canEdit={profile.role==="admin" || profile.role==="manager"} canDelete={profile.role==="admin"} onBack={()=>setSelectedItemId(null)} onDeleted={()=>setSelectedItemId(null)} onItemClick={setSelectedItemId} />}
        {active==="Admin / Master Data" && <RedesignedMasterData supabase={supabase} canEdit={profile.role==="admin"} activeKey={masterCategory} onActiveChange={setMasterCategory} />}
        {active.startsWith("Transit") && <TransitModule supabase={supabase} canEdit={profile.role==="admin" || profile.role==="manager"} canDelete={profile.role==="admin"} view={transitCategory} onItemClick={(id) => { setActive("Global Stock"); setSelectedItemId(id); }} />}
      </WorkspaceErrorBoundary>
      {active!=="Global Stock" && active!=="Admin / Master Data" && !active.startsWith("Transit") && <section className="content-card"><div className="section-heading">
        <div><p className="section-kicker">{active.toUpperCase()}</p><h2>Module ready</h2><p>Authentication and role access are connected. This module will be built on the live IMS database next.</p></div>
      </div></section>}
    </main>
  </div>;
}
