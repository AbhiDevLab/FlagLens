const DEFAULT_RULES = {
  blockProductionOnlyFlags: true,
  blockExperimentalFlagsInProduction: true,
  failOnMissingStates: true,
  maxMediumFindings: 5,
};

export function validatePolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return ["Policy must be a JSON object."];
  }
  if (policy.version !== 1) errors.push("Policy version must be 1.");
  if (!policy.rules || typeof policy.rules !== "object" || Array.isArray(policy.rules)) {
    errors.push("Policy rules must be an object.");
    return errors;
  }
  for (const key of Object.keys(policy.rules)) {
    if (!(key in DEFAULT_RULES)) errors.push(`Unknown policy rule: ${key}.`);
  }
  for (const key of ["blockProductionOnlyFlags", "blockExperimentalFlagsInProduction", "failOnMissingStates"]) {
    if (key in policy.rules && typeof policy.rules[key] !== "boolean") {
      errors.push(`${key} must be a boolean.`);
    }
  }
  if ("maxMediumFindings" in policy.rules &&
      (!Number.isInteger(policy.rules.maxMediumFindings) || policy.rules.maxMediumFindings < 0)) {
    errors.push("maxMediumFindings must be a non-negative integer.");
  }
  return errors;
}

export function evaluatePolicy(policy, report) {
  const violations = [];
  if (report?.status !== "complete" || report.riskScore === null) {
    violations.push("Release analysis is incomplete; both Development and Production must be connected.");
    return { passed: false, violations };
  }

  const rules = { ...DEFAULT_RULES, ...policy.rules };
  const findings = report.findings ?? [];

  if (rules.blockProductionOnlyFlags && findings.some((item) => item.code === "PRODUCTION_ONLY")) {
    violations.push("Production-only feature flags are not permitted.");
  }
  if (rules.blockExperimentalFlagsInProduction && findings.some((item) => item.code === "RISKY_PRODUCTION_FEATURE")) {
    violations.push("Experimental feature enabled in Production.");
  }
  if (rules.failOnMissingStates && findings.some((item) => item.code === "MISSING_FEATURE_STATE")) {
    violations.push("Missing environment feature states detected.");
  }
  const mediumCount = report.severityCounts?.medium ??
    findings.filter((item) => item.severity === "medium").length;
  if (mediumCount > rules.maxMediumFindings) {
    violations.push(`Medium findings exceed the permitted limit of ${rules.maxMediumFindings}.`);
  }
  return { passed: violations.length === 0, violations };
}
