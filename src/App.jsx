import { useCallback, useEffect, useState } from "react";
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

        <section className="content-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">{active.toUpperCase()}</p>
              <h2>Workspace ready</h2>
              <p>
                Authentication is connected. The next step is to add role-based
                database policies and connect each module to live data.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
