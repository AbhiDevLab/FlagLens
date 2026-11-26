
const RISKY_PRODUCTION_PATTERN =
  /(?:^|[^a-z0-9])(beta|experimental|debug|internal|preview|test)(?:$|[^a-z0-9])/i;

export function analyzeReleaseRisk(overview) {
  const development = overview.environments.find(
    (environment) => environment.name === "Development"
  );

  const production = overview.environments.find(
    (environment) => environment.name === "Production"
  );

  if (!development?.connected || !production?.connected) {
    return {
      status: "incomplete",
      riskScore: null,
      riskLevel: "Unavailable",
      findings: [],
      message: "Both environments must be connected for release analysis.",
    };
  }

  const findings = [];

  for (const feature of overview.features) {
    if (feature.is_archived) continue;

    const devState = development.featureStates.find(
      (state) =>
        state.feature === feature.id &&
        state.identity === null &&
        state.feature_segment === null
    );

    const prodState = production.featureStates.find(
      (state) =>
        state.feature === feature.id &&
        state.identity === null &&
        state.feature_segment === null
    );

    if (!devState || !prodState) {
      findings.push({
        code: "MISSING_FEATURE_STATE",
        feature: feature.name,
        severity: "medium",
        points: 10,
        title: "Missing environment configuration",
        message: `${feature.name} does not have a complete global state in both environments.`,
        recommendation: "Inspect the feature configuration in Flagsmith before release.",
      });

      continue;
    }

    if (devState.enabled && !prodState.enabled) {
      findings.push({
        code: "NOT_PROMOTED",
        feature: feature.name,
        severity: "medium",
        points: 15,
        title: "Feature not promoted",
        message: `${feature.name} is enabled in Development but disabled in Production.`,
        recommendation: "Review whether this feature is ready for production promotion.",
      });
    }

    if (!devState.enabled && prodState.enabled) {
      findings.push({
        code: "PRODUCTION_ONLY",
        feature: feature.name,
        severity: "high",
        points: 35,
        title: "Unexpected production exposure",
        message: `${feature.name} is enabled in Production but disabled in Development.`,
        recommendation: "Require a release review and verify the intended production state.",
      });
    }

    if (
      prodState.enabled &&
      RISKY_PRODUCTION_PATTERN.test(feature.name)
    ) {
      findings.push({
        code: "RISKY_PRODUCTION_FEATURE",
        feature: feature.name,
        severity: "high",
        points: 25,
        title: "Experimental feature enabled in production",
        message: `${feature.name} has a name associated with experimental, testing or internal functionality and is enabled in Production.`,
        recommendation: "Verify that this feature is approved for production exposure.",
      });
    }
  }

  const riskScore = Math.min(
    100,
    findings.reduce((total, finding) => total + finding.points, 0)
  );

  const riskLevel =
    riskScore >= 75
      ? "Critical"
      : riskScore >= 50
        ? "High"
        : riskScore >= 20
          ? "Moderate"
          : "Low";

  return {
    status: "complete",
    riskScore,
    riskLevel,
    totalFindings: findings.length,
    severityCounts: {
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
    },
    findings,
    scoringMethod: "Deterministic policy-based heuristic",
    disclaimer:
      "This score is a configurable review heuristic, not a prediction of production failure or a Flagsmith-native metric.",
    generatedAt: new Date().toISOString(),
  };
}
