import RiskPanel, { type RiskReport } from "./components/RiskPanel";
import FeatureExplorer from "./components/FeatureExplorer";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Command,
  Database,
  GitBranch,
  GitCompareArrows,
  FileSearch,
  Workflow,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
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
  identity?: unknown;
  feature_segment?: unknown;
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
    environment.featureStates.find(
      (state) =>
        state.feature === featureId &&
        (state.identity === null || state.identity === undefined) &&
        (state.feature_segment === null || state.feature_segment === undefined),
    )?.enabled ?? null
  );
}

function App() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [activeSection, setActiveSection] = useState(() => window.location.hash.slice(1) || "overview");

  useEffect(() => {
    const syncActiveSection = () => setActiveSection(window.location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", syncActiveSection);
    return () => window.removeEventListener("hashchange", syncActiveSection);
  }, []);

  const fetchOverview = useCallback(async (): Promise<Overview> => {
    const response = await fetch(`${API}/flagsmith/overview/1`);

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `Request failed: ${response.status}`);
    }

    return (await response.json()) as Overview;
  }, []);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    setError("");

    try {
      const result = await fetchOverview();
      setData(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to FlagLens API.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [fetchOverview]);

  useEffect(() => {
    let cancelled = false;

    fetchOverview()
      .then((result) => {
        if (cancelled) return;

        setData(result);
        setLastUpdated(new Date().toLocaleTimeString());
      })
      .catch((err) => {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to connect to FlagLens API.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchOverview]);

  const development = data?.environments.find(
    (environment) => environment.name === "Development",
  );

  const production = data?.environments.find(
    (environment) => environment.name === "Production",
  );

  const activeCount =
    data?.features.filter(
      (feature) => getState(development, feature.id) === true,
    ).length ?? 0;

  const driftCount =
    data?.features.filter((feature) => {
      const devState = getState(development, feature.id);
      const prodState = getState(production, feature.id);

      return devState !== null && prodState !== null && devState !== prodState;
    }).length ?? 0;

  const connectedCount =
    data?.environments.filter((environment) => environment.connected).length ??
    0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={22} />
          </div>
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
          <a className={`nav-link ${activeSection === "overview" ? "active" : ""}`} href="#overview">
            <LayoutDashboard size={17} /> Overview
          </a>
          <a className={`nav-link ${activeSection === "environments" ? "active" : ""}`} href="#environments">
            <GitCompareArrows size={17} /> Environment drift
            <span className="nav-tag">CORE</span>
          </a>
          <a className={`nav-link ${activeSection === "features" ? "active" : ""}`} href="#features">
            <SlidersHorizontal size={17} /> Feature inventory
          </a>
          <a className={`nav-link ${activeSection === "audit" ? "active" : ""}`} href="#audit">
            <FileSearch size={17} /> Repository audit · CLI
          </a>
          <a className={`nav-link ${activeSection === "policies" ? "active" : ""}`} href="#policies">
            <ShieldCheck size={17} /> Release policies · CLI
          </a>
        </nav>

        <div className="nav-label secondary-label">DEVELOPMENT</div>
        <nav className="nav-links">
          <a className={`nav-link ${activeSection === "connection" ? "active" : ""}`} href="#connection">
            <Database size={17} /> Integrations
          </a>
          <a className={`nav-link ${activeSection === "github-actions" ? "active" : ""}`} href="#github-actions">
            <Workflow size={17} /> GitHub Actions · CI
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="connection-heading">
              <span className="connection-dot" />
              Self-hosted instance
            </div>
            <span className="connection-url">localhost:8000</span>
            <span className="connection-description">
              Flagsmith API connected
            </span>
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
            <div className="eyebrow">
              <Sparkles size={13} /> DEVELOPER CONTROL CENTRE
            </div>
            <h1>Project overview</h1>
            <p>
              Monitor feature flags, compare environments and govern releases.
            </p>
          </div>
          <button
            className="refresh-button"
            onClick={() => void refreshData()}
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
            <button onClick={() => void refreshData()}>Retry</button>
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
              <div className="project-symbol">
                <Command size={21} />
              </div>
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
                  <div className="stat-icon purple">
                    <SlidersHorizontal size={18} />
                  </div>
                </div>
                <strong className="stat-number">{data.features.length}</strong>
                <span className="stat-foot">Live project inventory</span>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Development enabled</span>
                  <div className="stat-icon green">
                    <Zap size={18} />
                  </div>
                </div>
                <strong className="stat-number">
                  {development?.connected
                    ? `${activeCount}/${data.features.length}`
                    : "—"}
                </strong>
                <span className="stat-foot">
                  {development?.connected
                    ? "Active feature flags"
                    : "Environment key required"}
                </span>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Environment drift</span>
                  <div className="stat-icon amber">
                    <GitBranch size={18} />
                  </div>
                </div>
                <strong className="stat-number">
                  {production?.connected ? driftCount : "—"}
                </strong>
                <span className="stat-foot">
                  {production?.connected
                    ? "Configuration differences"
                    : "Awaiting Production connection"}
                </span>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Connected environments</span>
                  <div className="stat-icon blue">
                    <Database size={18} />
                  </div>
                </div>
                <strong className="stat-number">
                  {connectedCount}/{data.environments.length}
                </strong>
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
                <span className="section-count">
                  {data.environments.length} environments
                </span>
              </div>

              <div className="environment-grid">
                {data.environments.map((environment) => (
                  <div className="environment-card" key={environment.id}>
                    <div className="environment-card-top">
                      <div className="environment-icon">
                        <Database size={19} />
                      </div>
                      <span
                        className={`connection-label ${environment.connected ? "online" : "offline"}`}
                      >
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
                      {environment.connected ? (
                        <CheckCircle2 size={17} className="success-icon" />
                      ) : (
                        <CircleAlert size={17} className="warning-icon" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <FeatureExplorer
              features={data.features}
              environments={data.environments}
              projectName={data.project.name}
              projectId={data.project.id}
              generatedAt={data.generatedAt}
            />


            <section className="section-block" id="audit">
              <div className="section-heading"><div><h2>Repository audit</h2><p>Scan JavaScript and TypeScript source for feature-flag references.</p></div><span className="section-count">CLI · AST SCANNER</span></div>
              <div className="governance-panel"><strong>Run a repository scan</strong><p>Find unknown feature references, dynamic keys requiring review and configured flags not found in source.</p><pre><code>cd cli{"\n"}npm start -- scan ../path/to/your-app{"\n"}npm start -- scan ../path/to/your-app --strict</code></pre><small>Supported extensions: .js, .jsx, .ts, .tsx, .mjs and .cjs.</small></div>
            </section>

            <section className="section-block" id="policies">
              <div className="section-heading"><div><h2>Release policies</h2><p>Apply version-controlled governance rules before release.</p></div><span className="section-count">POLICY ENGINE</span></div>
              <div className="governance-panel"><strong>Evaluate the current policy</strong><p>Rules can block Production-only flags, experimental flags enabled in Production and missing environment states.</p><pre><code>cd cli{"\n"}npm start -- policy check{"\n"}npm start -- report --format both --scan-path ../path/to/your-app</code></pre><small>Edit flaglens.policy.json to align checks with your team's release process.</small></div>
            </section>

            <section className="section-block" id="connection">
              <div className="section-heading"><div><h2>Integrations</h2><p>Connect FlagLens to your self-hosted Flagsmith instance.</p></div><span className="section-count">FLAGS MITH API</span></div>
              <div className="governance-panel"><strong>Backend connection settings</strong><p>Set these values in backend/.env. Keep the Management API token on the server; never expose it in frontend code.</p><pre><code>PORT=4000{"\n"}FLAGSMITH_BASE_URL=http://localhost:8000{"\n"}FLAGSMITH_API_KEY=your-management-token{"\n"}FLAGSMITH_DEVELOPMENT_ENV_KEY=your-development-key{"\n"}FLAGSMITH_PRODUCTION_ENV_KEY=your-production-key</code></pre><small>Expected environment names: Development and Production. Restart the backend after changing credentials.</small></div>
            </section>

            <section className="roadmap-banner" id="github-actions">
              <div className="roadmap-icon">
                <ShieldCheck size={23} />
              </div>
              <div>
                <span className="eyebrow">CLI &amp; CI CAPABILITIES</span>
                <h3>Governance workflows</h3>
                <p>
                  Repository scanning and configurable policy checks are available
                  through the FlagLens CLI. The GitHub Actions release guard has
                  been end-to-end verified with both an approved clean fixture and
                  an intentionally blocked negative fixture. JSON and Markdown
                  audit artifacts are retained for both outcomes.
                </p>
              </div>
              <span className="roadmap-status">
                CI VERIFIED <CheckCircle2 size={14} />
              </span>
            </section>
          </>
        ) : (
          <div className="loading-panel">No Flagsmith data returned.</div>
        )}

        <footer className="footer">
          <span>
            <ShieldCheck size={14} /> FlagLens · Self-hosted Flagsmith
            integration
          </span>
          <span>
            <span className="connection-dot" /> Local development
          </span>
        </footer>
      </main>
    </div>
  );
}

export default App;
