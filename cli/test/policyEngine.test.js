import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy, validatePolicy } from "../src/policyEngine.js";

const policy = { version: 1, rules: {
  blockProductionOnlyFlags: true,
  blockExperimentalFlagsInProduction: true,
  failOnMissingStates: true,
  maxMediumFindings: 2,
}};
const report = (findings = [], status = "complete") => ({
  status, riskScore: status === "complete" ? 0 : null,
  findings, severityCounts: {
    high: findings.filter((x) => x.severity === "high").length,
    medium: findings.filter((x) => x.severity === "medium").length,
    low: findings.filter((x) => x.severity === "low").length,
  },
});

test("accepts a valid version 1 policy", () => assert.deepEqual(validatePolicy(policy), []));
test("rejects unsupported policy versions and rule names", () => {
  assert.equal(validatePolicy({ version: 2, rules: { typoRule: true } }).length, 2);
});
test("rejects invalid rule value types and negative thresholds", () => {
  assert.equal(validatePolicy({ version: 1, rules: { blockProductionOnlyFlags: "yes", maxMediumFindings: -1 } }).length, 2);
});
test("blocks production-only flags", () => {
  const result = evaluatePolicy(policy, report([{ code: "PRODUCTION_ONLY", severity: "high" }]));
  assert.equal(result.passed, false);
  assert.match(result.violations[0], /Production-only/);
});
test("blocks experimental production flags", () => {
  const result = evaluatePolicy(policy, report([{ code: "RISKY_PRODUCTION_FEATURE", severity: "high" }]));
  assert.equal(result.passed, false);
});
test("blocks missing feature states", () => {
  const result = evaluatePolicy(policy, report([{ code: "MISSING_FEATURE_STATE", severity: "medium" }]));
  assert.equal(result.passed, false);
});
test("blocks when medium finding threshold is exceeded", () => {
  const findings = Array.from({ length: 3 }, () => ({ code: "NOT_PROMOTED", severity: "medium" }));
  assert.equal(evaluatePolicy(policy, report(findings)).passed, false);
});
test("passes clean complete reports", () => assert.equal(evaluatePolicy(policy, report()).passed, true));
test("fails closed when either environment analysis is incomplete", () => {
  const result = evaluatePolicy(policy, report([], "incomplete"));
  assert.equal(result.passed, false);
  assert.match(result.violations[0], /incomplete/);
});
