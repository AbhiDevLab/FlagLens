function uniqueRecommendations(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildAuditReport({
  project,
  environments = [],
  risk,
  scanner = null,
  scannerError = null,
  scannerStrict = false,
  policyDefinition = null,
  policyResult = null,
  policyErrors = [],
  generatedAt = new Date().toISOString(),
}) {
  const unknownReferences = scanner?.unknownReferences ?? [];
  const unreferencedFlags = scanner?.unreferencedFlags ?? [];
  const scannerViolations = [];

  if (scannerError) {
    scannerViolations.push(`Repository scan failed: ${scannerError}`);
  } else if (scanner && scannerStrict && unknownReferences.length > 0) {
    scannerViolations.push(
      `Repository contains ${unknownReferences.length} unknown feature reference(s).`
    );
  }

  const riskViolations = policyResult?.violations ?? policyErrors;
  const violations = [...riskViolations, ...scannerViolations];
  const riskPolicyPassed = policyResult?.passed === true;
  const scannerPassed = scannerError
    ? false
    : scanner
      ? !scannerStrict || unknownReferences.length === 0
      : null;
  const policyPassed = riskPolicyPassed && scannerPassed !== false;

  const recommendations = [
    ...(risk?.findings ?? []).map((finding) => ({
      source: "risk",
      severity: finding.severity,
      feature: finding.feature,
      message: finding.recommendation,
    })),
    ...unknownReferences.map((item) => ({
      source: "scanner",
      severity: "high",
      feature: item.feature,
      message: `Register "${item.feature}" in Flagsmith or correct/remove the reference before release.`,
    })),
    ...unreferencedFlags.map((item) => ({
      source: "scanner",
      severity: "medium",
      feature: item.feature,
      message: `Verify "${item.feature}" is obsolete before removing it; dynamic or indirect usage may not be detected.`,
    })),
    ...violations.map((message) => ({
      source: "policy",
      severity: "high",
      message: `Resolve release gate: ${message}`,
    })),
  ];

  const status = !policyPassed
    ? "blocked"
    : scanner
      ? "approved"
      : "incomplete";

  return {
    schemaVersion: 1,
    project: project?.name ?? "Unknown project",
    projectId: project?.id ?? null,
    generatedAt,
    status,
    environments: environments.map((environment) => ({
      name: environment.name,
      connected: environment.connected,
    })),
    risk,
    scanner: {
      status: scannerError ? "error" : scanner ? "complete" : "not-run",
      repository: scanner?.repository ?? null,
      filesScanned: scanner?.filesScanned ?? 0,
      totalReferences: scanner?.totalReferences ?? 0,
      uniqueReferencedFlags: scanner?.uniqueReferencedFlags ?? 0,
      configuredFlags: scanner?.configuredFlags ?? 0,
      strictMode: scanner ? scannerStrict : false,
      passed: scannerPassed,
      unknownReferences,
      unreferencedFlags,
      references: scanner?.references ?? {},
      error: scannerError,
      generatedAt: scanner?.generatedAt ?? null,
    },
    policy: {
      version: policyDefinition?.version ?? null,
      rules: policyDefinition?.rules ?? null,
      riskPassed: riskPolicyPassed,
      scannerEnforced: Boolean(scanner && scannerStrict),
      passed: policyPassed,
      violations,
    },
    recommendations: uniqueRecommendations(recommendations),
  };
}

function section(title, lines) {
  return [`## ${title}`, "", ...(lines.length ? lines : ["No findings."]), ""];
}

export function renderMarkdownReport(report) {
  const risk = report.risk ?? {};
  const scanner = report.scanner ?? {};
  const policy = report.policy ?? {};

  const lines = [
    "# FlagLens Release Governance Report",
    "",
    `- **Project:** ${report.project}`,
    `- **Project ID:** ${report.projectId ?? "Unavailable"}`,
    `- **Generated:** ${report.generatedAt}`,
    `- **Release status:** ${report.status.toUpperCase()}`,
    "",
    "## Executive summary",
    "",
    `- **Risk:** ${risk.riskScore === null || risk.riskScore === undefined ? "Unavailable" : `${risk.riskScore}/100 (${risk.riskLevel})`}`,
    `- **Risk findings:** ${risk.totalFindings ?? risk.findings?.length ?? 0}`,
    `- **Files scanned:** ${scanner.filesScanned ?? 0}`,
    `- **Unknown references:** ${scanner.unknownReferences?.length ?? 0}`,
    `- **Unreferenced flags:** ${scanner.unreferencedFlags?.length ?? 0}`,
    `- **Policy:** ${policy.passed ? "Passed" : "Blocked"}`,
    `- **Policy violations:** ${policy.violations?.length ?? 0}`,
    "",
    "## Environment connectivity",
    "",
    ...(report.environments.length
      ? report.environments.map((item) =>
          `- ${item.name}: ${item.connected ? "Connected" : "Not connected"}`
        )
      : ["No environment information available."]),
    "",
    "## Risk findings",
    "",
  ];

  if (risk.findings?.length) {
    for (const finding of risk.findings) {
      lines.push(
        `### [${finding.severity.toUpperCase()}] ${finding.title}: ${finding.feature}`,
        "",
        `- **Code:** ${finding.code}`,
        `- **Risk points:** +${finding.points}`,
        `- **Explanation:** ${finding.message}`,
        `- **Recommendation:** ${finding.recommendation}`,
        ""
      );
    }
  } else {
    lines.push("No risk findings.", "");
  }

  lines.push("## Repository scan", "");
  lines.push(
    `- **Status:** ${scanner.status ?? "not-run"}`,
    `- **Repository:** ${scanner.repository ?? "Not scanned"}`,
    `- **Strict mode:** ${scanner.strictMode ? "Enabled" : "Disabled"}`,
    `- **Files scanned:** ${scanner.filesScanned ?? 0}`,
    `- **Total references:** ${scanner.totalReferences ?? 0}`,
    ""
  );

  lines.push("### Unknown feature references", "");
  if (scanner.unknownReferences?.length) {
    for (const item of scanner.unknownReferences) {
      lines.push(
        `- **${item.feature}** (${item.severity}) — ${item.message}`
      );
      for (const location of item.locations ?? []) {
        lines.push(`  - \`${location.file}:${location.line}\``);
      }
    }
    lines.push("");
  } else {
    lines.push("None detected.", "");
  }

  lines.push("### Unreferenced configured flags", "");
  if (scanner.unreferencedFlags?.length) {
    for (const item of scanner.unreferencedFlags) {
      lines.push(`- **${item.feature}** (${item.severity}) — ${item.message}`);
    }
    lines.push("");
  } else {
    lines.push("None detected.", "");
  }

  lines.push("## Policy evaluation", "");
  lines.push(
    `- **Risk policy:** ${policy.riskPassed ? "Passed" : "Failed"}`,
    `- **Scanner enforcement:** ${policy.scannerEnforced ? "Enabled" : "Disabled"}`,
    `- **Overall policy result:** ${policy.passed ? "PASSED" : "BLOCKED"}`,
    ""
  );

  if (policy.violations?.length) {
    for (const violation of policy.violations) {
      lines.push(`- **BLOCK:** ${violation}`);
    }
    lines.push("");
  } else {
    lines.push("No policy violations.", "");
  }

  lines.push("## Remediation recommendations", "");
  if (report.recommendations.length) {
    for (const item of report.recommendations) {
      const feature = item.feature ? ` — ${item.feature}` : "";
      lines.push(
        `- **[${item.source.toUpperCase()} / ${item.severity.toUpperCase()}]${feature}:** ${item.message}`
      );
    }
    lines.push("");
  } else {
    lines.push("No remediation actions generated.", "");
  }

  lines.push(
    "> Risk scores are deterministic review heuristics, not predictions of deployment failure.",
    "> Unreferenced flags are not automatically stale or safe to delete.",
    ""
  );

  return lines.join("\n");
}

export function renderJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
