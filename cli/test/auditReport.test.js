import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditReport,
  renderJsonReport,
  renderMarkdownReport,
} from "../src/auditReport.js";

const risk = {
  status: "complete",
  riskScore: 0,
  riskLevel: "Low",
  totalFindings: 0,
  findings: [],
};

const project = { id: 7, name: "FlagLens Test" };
const environments = [
  { name: "Development", connected: true },
  { name: "Production", connected: true },
];
const policyDefinition = {
  version: 1,
  rules: { maxMediumFindings: 5 },
};

test("builds an approved unified report with scanner evidence", () => {
  const report = buildAuditReport({
    project,
    environments,
    risk,
    scanner: {
      repository: "/tmp/example",
      filesScanned: 2,
      totalReferences: 1,
      uniqueReferencedFlags: 1,
      configuredFlags: 1,
      unknownReferences: [],
      unreferencedFlags: [],
      references: { stable_flag: [{ file: "src/app.js", line: 1 }] },
      generatedAt: "2026-11-26T00:00:00.000Z",
    },
    policyDefinition,
    policyResult: { passed: true, violations: [] },
    generatedAt: "2026-11-26T00:00:01.000Z",
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, "approved");
  assert.equal(report.project, "FlagLens Test");
  assert.equal(report.scanner.filesScanned, 2);
  assert.equal(report.policy.passed, true);
  assert.deepEqual(report.policy.violations, []);
});

test("blocks strict scans with unknown references and provides remediation", () => {
  const report = buildAuditReport({
    project,
    environments,
    risk,
    scanner: {
      filesScanned: 1,
      totalReferences: 1,
      uniqueReferencedFlags: 1,
      configuredFlags: 0,
      unknownReferences: [{
        feature: "missing_flag",
        severity: "high",
        locations: [{ file: "src/app.js", line: 4 }],
        message: "Feature missing_flag is not configured.",
      }],
      unreferencedFlags: [],
      references: {},
    },
    scannerStrict: true,
    policyDefinition,
    policyResult: { passed: true, violations: [] },
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.scanner.passed, false);
  assert.equal(report.policy.passed, false);
  assert.match(report.policy.violations[0], /unknown feature reference/);
  assert.ok(report.recommendations.some((item) =>
    item.feature === "missing_flag" && item.source === "scanner"
  ));
});

test("keeps unreferenced flags as remediation warnings, not automatic blocks", () => {
  const report = buildAuditReport({
    project,
    environments,
    risk,
    scanner: {
      filesScanned: 1,
      totalReferences: 0,
      uniqueReferencedFlags: 0,
      configuredFlags: 1,
      unknownReferences: [],
      unreferencedFlags: [{
        feature: "legacy_flag",
        severity: "medium",
        message: "No static reference was found.",
      }],
      references: {},
    },
    scannerStrict: true,
    policyDefinition,
    policyResult: { passed: true, violations: [] },
  });

  assert.equal(report.status, "approved");
  assert.ok(report.recommendations.some((item) =>
    item.feature === "legacy_flag" && item.severity === "medium"
  ));
});

test("fails closed when policy evaluation or repository scanning fails", () => {
  const policyFailure = buildAuditReport({
    project,
    environments,
    risk,
    policyErrors: ["Policy file is invalid."],
  });
  const scanFailure = buildAuditReport({
    project,
    environments,
    risk,
    scannerError: "Repository path does not exist.",
    policyDefinition,
    policyResult: { passed: true, violations: [] },
  });

  assert.equal(policyFailure.status, "blocked");
  assert.equal(policyFailure.policy.passed, false);
  assert.equal(scanFailure.status, "blocked");
  assert.match(scanFailure.policy.violations[0], /Repository scan failed/);
});

test("renders valid JSON and a Markdown audit with all governance sections", () => {
  const report = buildAuditReport({
    project,
    environments,
    risk,
    scanner: {
      filesScanned: 1,
      totalReferences: 1,
      uniqueReferencedFlags: 1,
      configuredFlags: 1,
      unknownReferences: [],
      unreferencedFlags: [],
      references: {},
    },
    policyDefinition,
    policyResult: { passed: true, violations: [] },
  });

  const json = JSON.parse(renderJsonReport(report));
  const markdown = renderMarkdownReport(report);

  assert.equal(json.status, "approved");
  assert.match(markdown, /Executive summary/);
  assert.match(markdown, /Risk findings/);
  assert.match(markdown, /Repository scan/);
  assert.match(markdown, /Policy evaluation/);
  assert.match(markdown, /Remediation recommendations/);
});
