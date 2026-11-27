import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  GitCompareArrows,
  Search,
  SlidersHorizontal,
  X,
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
};

type FilterKey = "all" | "drift" | "production" | "development" | "missing" | "matched";

type ReviewStatus = "production" | "development" | "missing" | "matched";

type ReviewRow = {
  feature: Feature;
  development: boolean | null;
  production: boolean | null;
  status: ReviewStatus;
};

type Props = {
  features: Feature[];
  environments: Environment[];
  projectName: string;
  projectId: number;
  generatedAt: string;
};

function getGlobalState(environment: Environment | undefined, featureId: number) {
  if (!environment?.connected) return null;
  const state = environment.featureStates.find(
    (item) =>
      item.feature === featureId &&
      (item.identity === null || item.identity === undefined) &&
      (item.feature_segment === null || item.feature_segment === undefined),
  );
  return state ? state.enabled : null;
}

function stateLabel(value: boolean | null) {
  if (value === null) return "Unavailable";
  return value ? "Enabled" : "Disabled";
}

function StatePill({ value }: { value: boolean | null }) {
  const tone = value === null ? "unknown" : value ? "enabled" : "disabled";
  return (
    <span className={`state-badge ${tone}`}>
      <span className="state-dot" />
      {stateLabel(value)}
    </span>
  );
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All flags" },
  { key: "drift", label: "Drift" },
  { key: "production", label: "Production only" },
  { key: "development", label: "Development only" },
  { key: "missing", label: "Missing data" },
  { key: "matched", label: "In sync" },
];

export default function FeatureExplorer({
  features,
  environments,
  projectName,
  projectId,
  generatedAt,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const development = environments.find((item) => item.name === "Development");
  const production = environments.find((item) => item.name === "Production");

  const rows = useMemo<ReviewRow[]>(() => {
    return features
      .filter((feature) => !feature.is_archived)
      .map((feature) => {
        const dev = getGlobalState(development, feature.id);
        const prod = getGlobalState(production, feature.id);
        let status: ReviewRow["status"] = "matched";
        if (dev === null || prod === null) status = "missing";
        else if (!dev && prod) status = "production";
        else if (dev && !prod) status = "development";
        return { feature, development: dev, production: prod, status };
      });
  }, [features, development, production]);

  const counts = useMemo(() => ({
    all: rows.length,
    drift: rows.filter((row) => row.status === "production" || row.status === "development").length,
    production: rows.filter((row) => row.status === "production").length,
    development: rows.filter((row) => row.status === "development").length,
    missing: rows.filter((row) => row.status === "missing").length,
    matched: rows.filter((row) => row.status === "matched").length,
  }), [rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "drift"
          ? row.status === "production" || row.status === "development"
          : row.status === filter);
      const matchesSearch =
        !needle ||
        `${row.feature.name} ${row.feature.description ?? ""} ${row.feature.type ?? ""}`
          .toLowerCase()
          .includes(needle);
      return matchesFilter && matchesSearch;
    });
  }, [rows, filter, query]);

  const selected = rows.find((row) => row.feature.id === selectedId) ?? null;

  const downloadSnapshot = () => {
    const snapshot = {
      schemaVersion: 1,
      kind: "flaglens-feature-review-snapshot",
      exportedAt: new Date().toISOString(),
      source: "Flagsmith Management API via FlagLens",
      project: { id: projectId, name: projectName },
      environments: environments.map((environment) => ({
        id: environment.id,
        name: environment.name,
        connected: environment.connected,
        returnedStateCount: environment.featureStates.length,
      })),
      summary: counts,
      features: rows.map((row) => ({
        id: row.feature.id,
        key: row.feature.name,
        description: row.feature.description ?? null,
        type: row.feature.type ?? null,
        development: stateLabel(row.development),
        production: stateLabel(row.production),
        reviewStatus: row.status,
      })),
      note: "This is a live configuration snapshot, not a CLI repository scan or a release approval. Identity- and segment-specific overrides are not represented.",
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flaglens-review-${projectId}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyFeatureKey = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.feature.name);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2200);
  };

  return (
    <section className="section-block feature-explorer" id="features">
      <div className="section-heading feature-heading">
        <div>
          <div className="eyebrow"><SlidersHorizontal size={13} /> LIVE CONFIGURATION EXPLORER</div>
          <h2>Feature inventory</h2>
          <p>Filter, inspect and export global Development vs Production flag states.</p>
        </div>
        <button className="export-button" onClick={downloadSnapshot} disabled={!rows.length}>
          <ArrowDownToLine size={15} /> Export review
        </button>
      </div>

      <div className="explorer-summary">
        <button className={`explorer-metric ${filter === "all" ? "selected" : ""}`} onClick={() => setFilter("all")} aria-pressed={filter === "all"}>
          <span>Tracked flags</span><strong>{counts.all}</strong><small>All non-archived definitions</small>
        </button>
        <button className={`explorer-metric warning ${filter === "drift" ? "selected" : ""}`} onClick={() => setFilter("drift")} aria-pressed={filter === "drift"}>
          <span>Environment drift</span><strong>{counts.drift}</strong><small>Different global states</small>
        </button>
        <button className={`explorer-metric danger ${filter === "production" ? "selected" : ""}`} onClick={() => setFilter("production")} aria-pressed={filter === "production"}>
          <span>Production only</span><strong>{counts.production}</strong><small>Disabled in Dev, enabled in Prod</small>
        </button>
        <button className={`explorer-metric muted ${filter === "missing" ? "selected" : ""}`} onClick={() => setFilter("missing")} aria-pressed={filter === "missing"}>
          <span>Incomplete state</span><strong>{counts.missing}</strong><small>At least one state unavailable</small>
        </button>
      </div>

      <div className="explorer-toolbar">
        <div className="explorer-filters" role="group" aria-label="Filter feature inventory">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              className={filter === item.key ? "filter-chip active" : "filter-chip"}
              onClick={() => setFilter(item.key)}
              aria-pressed={filter === item.key}
            >
              {item.label}
              <span>{counts[item.key]}</span>
            </button>
          ))}
        </div>
        <label className="table-search explorer-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flag name or description..." />
          {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>}
        </label>
      </div>

      <div className="table-wrapper">
        <table className="interactive-feature-table">
          <thead>
            <tr>
              <th>FEATURE</th><th>DEVELOPMENT</th><th>PRODUCTION</th><th>TYPE</th><th>REVIEW STATE</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.feature.id}
                className={selectedId === row.feature.id ? "clickable-row selected-row" : "clickable-row"}
                onClick={() => setSelectedId(row.feature.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(row.feature.id);
                  }
                }}
                tabIndex={0}
                aria-label={`Inspect feature ${row.feature.name}`}
              >
                <td>
                  <div className="feature-name">
                    <div className="feature-symbol"><Code2Icon /></div>
                    <div><strong>{row.feature.name}</strong><span>{row.feature.description || "No description provided"}</span></div>
                  </div>
                </td>
                <td><StatePill value={row.development} /></td>
                <td><StatePill value={row.production} /></td>
                <td><span className="type-label">{row.feature.type || "STANDARD"}</span></td>
                <td>
                  {row.status === "production" ? <span className="drift-label"><AlertCircle size={13} /> Production-only</span> :
                   row.status === "development" ? <span className="drift-label"><GitCompareArrows size={13} /> Not promoted</span> :
                   row.status === "missing" ? <span className="pending-label">Incomplete</span> :
                   <span className="matched-label"><CheckCircle2 size={13} /> In sync</span>}
                </td>
                <td><span className="inspect-link">Inspect <ChevronRight size={13} /></span></td>
              </tr>
            ))}
            {!visibleRows.length && (
              <tr><td colSpan={6} className="empty-state">No flags match this filter. Try another filter or search term.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>Showing {visibleRows.length} of {rows.length} flags</span>
        <span>Global states · Flagsmith Management API · Updated {new Date(generatedAt).toLocaleTimeString()}</span>
      </div>

      {selected && (
        <div className="feature-detail-panel">
          <div className="detail-heading">
            <div>
              <div className="eyebrow">FEATURE INSPECTOR · ID #{selected.feature.id}</div>
              <h3>{selected.feature.name}</h3>
              <p>{selected.feature.description || "No description provided by Flagsmith."}</p>
            </div>
            <div className="detail-actions">
              <button className="subtle-action" onClick={() => void copyFeatureKey()}>
                {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
                {copyState === "copied" ? "Copied" : "Copy key"}
              </button>
              <button className="close-detail" onClick={() => setSelectedId(null)} aria-label="Close feature details"><X size={17} /></button>
            </div>
          </div>
          {copyState === "error" && <p className="copy-error">Clipboard access was blocked by the browser. Select the feature key from the title.</p>}
          <div className="detail-state-grid">
            <div className="detail-state-card">
              <span><GitCompareArrows size={14} /> DEVELOPMENT</span>
              <StatePill value={selected.development} />
              <small>{development?.connected ? "Global environment state" : "Environment is not connected"}</small>
            </div>
            <div className="detail-state-card">
              <span><SlidersHorizontal size={14} /> PRODUCTION</span>
              <StatePill value={selected.production} />
              <small>{production?.connected ? "Global environment state" : "Environment is not connected"}</small>
            </div>
          </div>
          <div className="detail-footnote">
            <AlertCircle size={14} />
            {selected.status === "production"
              ? "Production is enabled while Development is disabled. Review this exposure before release."
              : selected.status === "development"
                ? "Development is enabled while Production is disabled. Confirm whether promotion is intended."
                : selected.status === "missing"
                  ? "At least one environment state is unavailable. Check connectivity and environment keys before relying on this comparison."
                  : "The retrieved global states match. Identity- and segment-specific targeting can still differ."}
          </div>
        </div>
      )}
    </section>
  );
}

function Code2Icon() {
  return <span className="code-glyph">{"</>"}</span>;
}
