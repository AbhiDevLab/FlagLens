import RiskPanel, { type RiskReport } from "./components/RiskPanel";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Code2,
  Command,
  Database,
  GitBranch,
  GitCompareArrows,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

type Feature = {
  id: number;
  name: string;
  description?: string | null;
  default_enabled: boolean;
  is_archived?: boolean;
  type?: string;
};

type FeatureState = {
  feature: number;
  enabled: boolean;
};

type Environment = {
  id: number;
  name: string;
  connected: boolean;
  featureStates: FeatureState[];
  message?: string;
};

type Overview = {
  organisation: { name: string } | null;
  project: { id: number; name: string };
  environments: Environment[];
  features: Feature[];
  generatedAt: string;
  risk: RiskReport;
};

const API = "http://localhost:4000/api";

function getState(environment: Environment | undefined, featureId: number) {
  if (!environment?.connected) return null;

  return (
    environment.featureStates.find((state) => state.feature === featureId)
      ?.enabled ?? null
  );
}

function StateBadge({ enabled }: { enabled: boolean | null }) {
  if (enabled === null) {
    return <span className="state-badge unknown">Not connected</span>;
  }

  return (
    <span className={`state-badge ${enabled ? "enabled" : "disabled"}`}>
      <span className="state-dot" />
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

function App() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const response = await fetch(`${API}/flagsmith/overview/1`);

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `Request failed: ${response.status}`);
      }

      const result: Overview = await response.json();

      setData(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to connect to FlagLens API."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const development = data?.environments.find(
    (environment) => environment.name === "Development"
  );

  const production = data?.environments.find(
    (environment) => environment.name === "Production"
  );

  const activeCount = data?.features.filter(
    (feature) => getState(development, feature.id) === true
  ).length ?? 0;

  const driftCount = data?.features.filter((feature) => {
    const devState = getState(development, feature.id);
    const prodState = getState(production, feature.id);

    return devState !== null && prodState !== null && devState !== prodState;
  }).length ?? 0;

  const visibleFeatures = useMemo(
    () =>
      (data?.features ?? []).filter((feature) =>
        `${feature.name} ${feature.description ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [data, search]
  );

  const connectedCount =
    data?.environments.filter((environment) => environment.connected).length ?? 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={22} /></div>
          <div>
            <div className="brand-name">FlagLens</div>
            <div className="brand-caption">RELEASE GOVERNANCE</div>
          </div>
        </div>

        <div className="workspace-select">
          <div className="workspace-avatar">FL</div>
          <div className="workspace-details">
            <span>Workspace</span>
            <strong>{data?.project.name ?? "FlagLens"}</strong>
          </div>
          <ChevronDown size={16} />
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="nav-links">
          <a className="nav-link active" href="#overview">
            <LayoutDashboard size={17} /> Overview
          </a>
          <a className="nav-link" href="#environments">
            <GitCompareArrows size={17} /> Environment drift
            <span className="nav-tag">CORE</span>
          </a>
          <a className="nav-link" href="#features">
            <SlidersHorizontal size={17} /> Feature inventory
          </a>
          <a className="nav-link" href="#roadmap">
            <Code2 size={17} /> Repository audit
          </a>
          <a className="nav-link" href="#roadmap">
            <ShieldCheck size={17} /> Release policies
          </a>
        </nav>

        <div className="nav-label secondary-label">DEVELOPMENT</div>
        <nav className="nav-links">
          <a className="nav-link" href="#connection">
            <Database size={17} /> Integrations
          </a>
          <a className="nav-link" href="#roadmap">
            <Terminal size={17} /> Activity logs
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="connection-heading">
              <span className="connection-dot" />
              Self-hosted instance
            </div>
            <span className="connection-url">localhost:8000</span>
            <span className="connection-description">Flagsmith API connected</span>
          </div>
          <div className="user-profile">
            <div className="user-avatar">AT</div>
            <div className="user-details">
              <strong>{data?.organisation?.name ?? "AbhiDevLab"}</strong>
              <span>Administrator</span>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>Overview</strong>
          </div>
          <div className="topbar-actions">
            <span className="system-status">
              <span className="connection-dot" /> LIVE CONNECTION
            </span>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={17} />
            </button>
            <div className="top-avatar">AT</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><Sparkles size={13} /> DEVELOPER CONTROL CENTRE</div>
            <h1>Project overview</h1>
            <p>Monitor feature flags, compare environments and govern releases.</p>
          </div>
          <button
            className="refresh-button"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            Refresh data
          </button>
        </section>

        {error && (
          <div className="error-banner">
            <CircleAlert size={18} />
            <span>{error}</span>
            <button onClick={() => void loadData(true)}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="loading-panel">
            <LoaderCircle className="spin" size={25} />
            <span>Retrieving live Flagsmith configuration...</span>
          </div>
        ) : data ? (
          <>
            <section className="project-strip">
              <div className="project-symbol"><Command size={21} /></div>
              <div className="project-meta">
                <span>ACTIVE PROJECT</span>
                <strong>{data.project.name}</strong>
              </div>
              <div className="project-meta organisation-meta">
                <span>ORGANISATION</span>
                <strong>{data.organisation?.name ?? "Unknown"}</strong>
              </div>
              <div className="project-meta">
                <span>PROJECT ID</span>
                <strong>#{data.project.id}</strong>
              </div>
              <div className="project-updated">
                <Activity size={15} />
                Updated {lastUpdated || "just now"}
              </div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <div className="stat-top">
                  <span>Total features</span>
                  <div className="stat-icon purple"><SlidersHorizontal size={18} /></div>
                </div>
                <strong className="stat-number">{data.features.length}</strong>
                <span className="stat-foot">Live project inventory</span>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Development enabled</span>
                  <div className="stat-icon green"><Zap size={18} /></div>
                </div>
                <strong className="stat-number">
                  {development?.connected ? `${activeCount}/${data.features.length}` : "—"}
                </strong>
                <span className="stat-foot">
                  {development?.connected ? "Active feature flags" : "Environment key required"}
                </span>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Environment drift</span>
                  <div className="stat-icon amber"><GitBranch size={18} /></div>
                </div>
                <strong className="stat-number">
                  {production?.connected ? driftCount : "—"}
                </strong>
                <span className="stat-foot">
                  {production?.connected ? "Configuration differences" : "Awaiting Production connection"}
                </span>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Connected environments</span>
                  <div className="stat-icon blue"><Database size={18} /></div>
                </div>
                <strong className="stat-number">{connectedCount}/{data.environments.length}</strong>
                <span className="stat-foot">Flagsmith environments</span>
              </div>
            </section>
            <RiskPanel risk={data.risk} />

            <section className="section-block" id="environments">
              <div className="section-heading">
                <div>
                  <h2>Environment connections</h2>
                  <p>Live connections to your self-hosted Flagsmith project.</p>
                </div>
                <span className="section-count">{data.environments.length} environments</span>
              </div>

              <div className="environment-grid">
                {data.environments.map((environment) => (
                  <div className="environment-card" key={environment.id}>
                    <div className="environment-card-top">
                      <div className="environment-icon">
                        <Database size={19} />
                      </div>
                      <span className={`connection-label ${environment.connected ? "online" : "offline"}`}>
                        <span className="connection-dot" />
                        {environment.connected ? "Connected" : "Key required"}
                      </span>
                    </div>
                    <h3>{environment.name}</h3>
                    <p>Environment ID #{environment.id}</p>
                    <div className="environment-footer">
                      <span>
                        {environment.connected
                          ? `${environment.featureStates.length} feature states retrieved`
                          : "Add this environment's client-side key"}
                      </span>
                      {environment.connected
                        ? <CheckCircle2 size={17} className="success-icon" />
                        : <CircleAlert size={17} className="warning-icon" />}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="section-block" id="features">
              <div className="section-heading feature-heading">
                <div>
                  <h2>Feature inventory</h2>
                  <p>Feature definitions and environment-specific enabled states.</p>
                </div>
                <div className="table-search">
                  <Search size={15} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search features..."
                  />
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>FEATURE</th>
                      <th>DEVELOPMENT</th>
                      <th>PRODUCTION</th>
                      <th>TYPE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFeatures.map((feature) => {
                      const devState = getState(development, feature.id);
                      const prodState = getState(production, feature.id);
                      const hasDrift =
                        devState !== null &&
                        prodState !== null &&
                        devState !== prodState;

                      return (
                        <tr key={feature.id}>
                          <td>
                            <div className="feature-name">
                              <div className="feature-symbol"><Code2 size={16} /></div>
                              <div>
                                <strong>{feature.name}</strong>
                                <span>{feature.description || "No description provided"}</span>
                              </div>
                            </div>
                          </td>
                          <td><StateBadge enabled={devState} /></td>
                          <td><StateBadge enabled={prodState} /></td>
                          <td><span className="type-label">{feature.type || "STANDARD"}</span></td>
                          <td>
                            {hasDrift
                              ? <span className="drift-label"><CircleAlert size={13} /> Drift detected</span>
                              : devState !== null && prodState !== null
                                ? <span className="matched-label"><CheckCircle2 size={13} /> Matched</span>
                                : <span className="pending-label">Pending</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {visibleFeatures.length === 0 && (
                      <tr><td colSpan={5} className="empty-state">No matching features found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>Showing {visibleFeatures.length} of {data.features.length} features</span>
                <span>Source: Flagsmith Management API</span>
              </div>
            </section>

            <section className="roadmap-banner" id="roadmap">
              <div className="roadmap-icon"><ShieldCheck size={23} /></div>
              <div>
                <span className="eyebrow">COMING NEXT</span>
                <h3>Release governance engine</h3>
                <p>Policy checks, source-code auditing, pull-request risk analysis and human-approved releases.</p>
              </div>
              <span className="roadmap-status">IN DEVELOPMENT <ArrowUpRight size={14} /></span>
            </section>
          </>
        ) : (
          <div className="loading-panel">No Flagsmith data returned.</div>
        )}

        <footer className="footer">
          <span><ShieldCheck size={14} /> FlagLens · Self-hosted Flagsmith integration</span>
          <span><span className="connection-dot" /> Local development</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
