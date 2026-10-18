import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase";
import asiaMedicorpLogo from "./assets/asia-medicorp-logo.png";
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
  const [globalStockType, setGlobalStockType] = useState("Machine");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [error, setError] = useState("");
  const navigationIndexRef = useRef(0);
  const currentViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [sidebarOpen]);

  const currentView = { active, masterCategory, transitCategory, globalStockType, selectedItemId };
  currentViewRef.current = currentView;

  const applyView = useCallback((view) => {
    setActive(view.active);
    setMasterCategory(view.masterCategory);
    setTransitCategory(view.transitCategory);
    setGlobalStockType(view.globalStockType || "Machine");
    setSelectedItemId(view.selectedItemId);
  }, []);

  const navigateTo = useCallback((updates) => {
    const current = currentViewRef.current || { active, masterCategory, transitCategory, globalStockType, selectedItemId };
    const next = { ...current, ...updates };
    if (
      next.active === current.active &&
      next.masterCategory === current.masterCategory &&
      next.transitCategory === current.transitCategory &&
      next.globalStockType === current.globalStockType &&
      next.selectedItemId === current.selectedItemId
    ) return;

    const currentIndex = Number(window.history.state?.imsIndex ?? navigationIndexRef.current ?? 0);
    const nextIndex = currentIndex + 1;
    window.history.pushState({ imsNavigation: true, imsIndex: nextIndex, imsView: next }, "");
    navigationIndexRef.current = nextIndex;
    currentViewRef.current = next;
    applyView(next);
    setCanGoBack(nextIndex > 0);
  }, [active, masterCategory, transitCategory, globalStockType, selectedItemId, applyView]);

  const goBack = useCallback(() => {
    const currentIndex = Number(window.history.state?.imsIndex ?? navigationIndexRef.current ?? 0);
    if (currentIndex > 0) window.history.back();
  }, []);

  useEffect(() => {
    if (!session || !profile) return;

    const existingState = window.history.state;
    if (existingState?.imsNavigation && existingState.imsView) {
      const index = Number(existingState.imsIndex) || 0;
      const restoredView = { globalStockType: "Machine", ...existingState.imsView };
      navigationIndexRef.current = index;
      currentViewRef.current = restoredView;
      applyView(restoredView);
      setCanGoBack(index > 0);
    } else {
      const initialView = currentViewRef.current || {
        active: "Global Stock",
        masterCategory: MASTER_GROUPS[0].key,
        transitCategory: "active",
        globalStockType: "Machine",
        selectedItemId: null,
      };
      window.history.replaceState({ imsNavigation: true, imsIndex: 0, imsView: initialView }, "");
      navigationIndexRef.current = 0;
      currentViewRef.current = initialView;
      setCanGoBack(false);
    }

    const handlePopState = (event) => {
      if (event.state?.imsNavigation && event.state.imsView) {
        const index = Number(event.state.imsIndex) || 0;
        const restoredView = { globalStockType: "Machine", ...event.state.imsView };
        navigationIndexRef.current = index;
        currentViewRef.current = restoredView;
        applyView(restoredView);
        setCanGoBack(index > 0);
      } else {
        navigationIndexRef.current = 0;
        setCanGoBack(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [session, profile, applyView]);

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
    const initialView = {
      active: "Global Stock",
      masterCategory: MASTER_GROUPS[0].key,
      transitCategory: "active",
      globalStockType: "Machine",
      selectedItemId: null,
    };
    setSession(null);
    setProfile(null);
    applyView(initialView);
    currentViewRef.current = initialView;
    navigationIndexRef.current = 0;
    setCanGoBack(false);
    window.history.replaceState({ imsNavigation: true, imsIndex: 0, imsView: initialView }, "");
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
    {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="Close navigation menu" onClick={() => setSidebarOpen(false)} />}
    <div
      className={sidebarOpen ? "sidebar-drawer open" : "sidebar-drawer"}
      onMouseLeave={() => setSidebarOpen(false)}
    >
      <div className="sidebar-controls">
        <button
          type="button"
          className="menu-trigger"
          aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={sidebarOpen}
          aria-controls="primary-navigation"
          onMouseEnter={() => {
            if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setSidebarOpen(true);
          }}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <button type="button" className="ims-back-button drawer-back-button" onClick={goBack} disabled={!canGoBack} aria-label="Go back to the previous IMS page" title={canGoBack ? "Go back to the previous IMS page" : "You are at the first IMS page"}>
          <span aria-hidden="true">←</span> Back
        </button>
      </div>
      <aside className="sidebar" id="primary-navigation" aria-label="Primary navigation">
      <nav className="nav" onClick={(event) => { if (event.target.closest("button")) setSidebarOpen(false); }}><p className="nav-title">WORKSPACE</p>
        {visibleNav.map(item=><div key={item.label} className="nav-group">
          <button
            className={(active===item.label || (item.label === "Transit" && active.startsWith("Transit")))?"nav-item active":"nav-item"}
            onClick={() => navigateTo({
              active: item.label,
              selectedItemId: null,
              masterCategory: item.label === "Admin / Master Data" ? (masterCategory || MASTER_GROUPS[0].key) : masterCategory,
              transitCategory: item.label === "Transit" ? "active" : transitCategory,
            })}
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
                    navigateTo({ active: "Admin / Master Data", masterCategory: group.key, selectedItemId: null });
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
                  navigateTo({ active: "Transit / Active Transits", transitCategory: "active", selectedItemId: null });
                }}
              >
                Active Transits
              </button>
              <button
                className={transitCategory === "past" ? "nav-subitem active" : "nav-subitem"}
                onClick={() => {
                  navigateTo({ active: "Transit / Past Transits", transitCategory: "past", selectedItemId: null });
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
    </div>
    <main className="main-content">
      <header className="topbar">
        <div className="platform-brand">
          <img className="platform-brand-logo" src={asiaMedicorpLogo} alt="Asia Medicorp logo" />
          <div className="platform-brand-copy">
            <strong>Asia Medicorp</strong>
            <span>Inventory Management</span>
          </div>
        </div>
        <div className="user-area"><div><strong>{profile.full_name || session.user.email}</strong><span>{profile.role}</span></div><button className="signout-button" onClick={signOut}>Sign out</button></div>
      </header>
      <div className="workspace-title">
        <p className="eyebrow">INVENTORY MANAGEMENT SYSTEM</p>
        <h1>{active}</h1>
      </div>
      {error && <div className="error-message">{error}</div>}
      <WorkspaceErrorBoundary key={active}>
        {active==="Global Stock" && <div style={{ display: selectedItemId ? "none" : "contents" }}><RedesignedGlobalStock supabase={supabase} canEdit={profile.role==="admin" || profile.role==="manager"} activeType={globalStockType} onActiveTypeChange={(type) => navigateTo({ globalStockType: type })} onItemClick={(id) => navigateTo({ selectedItemId: id })} /></div>}
        {active==="Global Stock" && selectedItemId && <RedesignedItemView supabase={supabase} itemId={selectedItemId} canEdit={profile.role==="admin" || profile.role==="manager"} canDelete={profile.role==="admin"} onBack={goBack} onDeleted={goBack} onItemClick={(id) => navigateTo({ selectedItemId: id })} />}
        {active==="Admin / Master Data" && <RedesignedMasterData supabase={supabase} canEdit={profile.role==="admin"} activeKey={masterCategory} onActiveChange={(key) => navigateTo({ masterCategory: key })} />}
        {active.startsWith("Transit") && <TransitModule supabase={supabase} canEdit={profile.role==="admin" || profile.role==="manager"} canDelete={profile.role==="admin"} canCreateLocation={profile.role==="admin"} view={transitCategory} onItemClick={(id) => navigateTo({ active: "Global Stock", selectedItemId: id })} />}
      </WorkspaceErrorBoundary>
      {active!=="Global Stock" && active!=="Admin / Master Data" && !active.startsWith("Transit") && <section className="content-card"><div className="section-heading">
        <div><p className="section-kicker">{active.toUpperCase()}</p><h2>Module ready</h2><p>Authentication and role access are connected. This module will be built on the live IMS database next.</p></div>
      </div></section>}
    </main>
  </div>;
}
