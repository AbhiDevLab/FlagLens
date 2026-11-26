import test from "node:test";
import assert from "node:assert/strict";
import { analyzeReleaseRisk } from "../src/riskEngine.js";

function makeOverview({ dev = true, prod = false, name = "checkout", connected = true, states = true } = {}) {
  const feature = { id: 1, name, is_archived: false };
  const featureStates = (enabled) => states ? [{
    feature: 1, identity: null, feature_segment: null, enabled,
  }] : [];
  return {
    features: [feature],
    environments: [
      { name: "Development", connected, featureStates: featureStates(dev) },
      { name: "Production", connected, featureStates: featureStates(prod) },
    ],
  };
}

test("scores a development-enabled production-disabled feature as +15", () => {
  const report = analyzeReleaseRisk(makeOverview());
  assert.equal(report.status, "complete");
  assert.equal(report.riskScore, 15);
  assert.equal(report.riskLevel, "Low");
  assert.equal(report.totalFindings, 1);
  assert.equal(report.findings[0].code, "NOT_PROMOTED");
});

test("flags production-only exposure as high severity", () => {
  const report = analyzeReleaseRisk(makeOverview({ dev: false, prod: true }));
  assert.equal(report.riskScore, 35);
  assert.equal(report.severityCounts.high, 1);
  assert.equal(report.findings[0].code, "PRODUCTION_ONLY");
});

test("flags experimental production exposure", () => {
  const report = analyzeReleaseRisk(makeOverview({ dev: true, prod: true, name: "beta_checkout" }));
  assert.equal(report.riskScore, 25);
  assert.equal(report.findings[0].code, "RISKY_PRODUCTION_FEATURE");
});

test("reports missing global states", () => {
  const report = analyzeReleaseRisk(makeOverview({ states: false }));
  assert.equal(report.riskScore, 10);
  assert.equal(report.findings[0].code, "MISSING_FEATURE_STATE");
});

test("returns an incomplete report when an environment is disconnected", () => {
  const report = analyzeReleaseRisk(makeOverview({ connected: false }));
  assert.equal(report.status, "incomplete");
  assert.equal(report.riskScore, null);
});

test("ignores archived features", () => {
  const overview = makeOverview();
  overview.features[0].is_archived = true;
  const report = analyzeReleaseRisk(overview);
  assert.equal(report.riskScore, 0);
  assert.equal(report.totalFindings, 0);
});

test("caps aggregate risk score at 100", () => {
  const overview = makeOverview({ dev: false, prod: true });
  overview.features = Array.from({ length: 4 }, (_, index) => ({
    id: index + 1, name: `feature_${index}`, is_archived: false,
  }));
  for (const environment of overview.environments) {
    environment.featureStates = overview.features.map((feature) => ({
      feature: feature.id, identity: null, feature_segment: null,
      enabled: environment.name === "Production",
    }));
  }
  assert.equal(analyzeReleaseRisk(overview).riskScore, 100);
});
