
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

export type RiskFinding = {
  code: string;
  feature: string;
  severity: "high" | "medium" | "low";
  points: number;
  title: string;
  message: string;
  recommendation: string;
};

export type RiskReport = {
  status: "complete" | "incomplete";
  riskScore: number | null;
  riskLevel: string;
  totalFindings: number;
  severityCounts: {
    high: number;
    medium: number;
    low: number;
  };
  findings: RiskFinding[];
  scoringMethod?: string;
  disclaimer?: string;
  message?: string;
};

export default function RiskPanel({
  risk,
}: {
  risk: RiskReport;
}) {
  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const filteredFindings = useMemo(
    () => severityFilter === "all" ? risk.findings : risk.findings.filter((finding) => finding.severity === severityFilter),
    [risk.findings, severityFilter],
  );
  if (risk.status !== "complete" || risk.riskScore === null) {
    return (
      <section className="section-block risk-panel">
        <div className="section-heading">
          <div>
            <h2>Release Risk Intelligence</h2>
            <p>Configuration and release readiness analysis.</p>
          </div>
        </div>
        <div className="risk-empty">
          <AlertTriangle size={22} />
          <strong>Analysis unavailable</strong>
          <span>
            {risk.message ||
              "Connect both environments to generate a risk report."}
          </span>
        </div>
      </section>
    );
  }

  const score = Math.max(0, Math.min(100, risk.riskScore));
  const level = risk.riskLevel.toLowerCase();

  return (
    <section className="section-block risk-panel" id="risk">
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={13} />
            RELEASE GOVERNANCE ENGINE
          </div>
          <h2>Release Risk Intelligence</h2>
          <p>
            Explainable policy-based analysis of your live
            Flagsmith configurations.
          </p>
        </div>

        <span className="risk-source">
          <CheckCircle2 size={14} />
          Live analysis
        </span>
      </div>

      <div className="risk-dashboard">
        <div className="risk-score-card">
          <div className="risk-score-heading">
            <span>RELEASE RISK SCORE</span>
            <span className={`risk-level risk-${level}`}>
              {risk.riskLevel}
            </span>
          </div>

          <div className="risk-score-value">
            {score}
            <span>/100</span>
          </div>

          <div
            className="risk-meter"
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Release risk score"
          >
            <div style={{ width: `${score}%` }} />
          </div>

          <p>
            Score generated from {risk.totalFindings} detected
            configuration findings.
          </p>
        </div>

        <div className="risk-severity-grid">
          <div className="severity-card high-card">
            <span>HIGH</span>
            <strong>{risk.severityCounts.high}</strong>
            <small>Critical review required</small>
          </div>

          <div className="severity-card medium-card">
            <span>MEDIUM</span>
            <strong>{risk.severityCounts.medium}</strong>
            <small>Review recommended</small>
          </div>

          <div className="severity-card low-card">
            <span>LOW</span>
            <strong>{risk.severityCounts.low}</strong>
            <small>Minor concerns</small>
          </div>
        </div>
      </div>

      <div className="findings-header">
        <div>
          <h3>Detected findings</h3>
          <p>Filter configuration differences by review severity.</p>
        </div>
        <span>{filteredFindings.length} of {risk.totalFindings} findings</span>
      </div>

      <div className="finding-filter-bar" role="group" aria-label="Filter risk findings">
        {(["all", "high", "medium", "low"] as const).map((severity) => {
          const count = severity === "all" ? risk.findings.length : risk.findings.filter((finding) => finding.severity === severity).length;
          const label = severity === "all" ? "All findings" : severity.charAt(0).toUpperCase() + severity.slice(1);
          return (
            <button key={severity} className={severityFilter === severity ? "finding-filter active" : "finding-filter"} onClick={() => setSeverityFilter(severity)} aria-pressed={severityFilter === severity}>
              {label}<span>{count}</span>
            </button>
          );
        })}
      </div>

      {risk.findings.length === 0 ? (
        <div className="risk-empty">
          <CheckCircle2 size={22} />
          <strong>No policy findings detected</strong>
          <span>
            No issues were identified by the currently configured rules.
          </span>
        </div>
      ) : filteredFindings.length === 0 ? (
        <div className="risk-empty compact-empty">
          <CheckCircle2 size={20} />
          <strong>No {severityFilter} findings</strong>
          <span>Choose another severity to inspect the remaining findings.</span>
        </div>
      ) : (
        <div className="risk-findings">
          {filteredFindings.map((finding, index) => (
            <article className="finding-card" key={`${finding.code}-${finding.feature}-${index}`}>
              <div className={`finding-icon severity-${finding.severity}`}>
                <AlertTriangle size={17} />
              </div>

              <div className="finding-content">
                <div className="finding-top">
                  <strong>{finding.title}</strong>
                  <span className={`finding-severity severity-${finding.severity}`}>
                    {finding.severity}
                  </span>
                </div>

                <span className="finding-feature">
                  {finding.feature}
                </span>

                <p>{finding.message}</p>

                <div className="finding-recommendation">
                  <ShieldCheck size={14} />
                  <span>{finding.recommendation}</span>
                </div>
              </div>

              <div className="finding-points">
                +{finding.points}
                <small>POINTS</small>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="risk-disclaimer">
        <ShieldCheck size={14} />
        {risk.disclaimer ||
          "Risk scores are heuristic indicators and require human review."}
      </div>
    </section>
  );
}
