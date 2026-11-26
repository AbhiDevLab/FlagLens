import { scanRepository } from "./scanner.js";
import { analyzeReleaseRisk } from "../../backend/src/riskEngine.js";
import { evaluatePolicy, validatePolicy } from "./policyEngine.js";
import "dotenv/config";
import { Command } from "commander";
import { config } from "dotenv";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to the CLI installation.
const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(CLI_DIR, "../..");
const POLICY_PATH = process.env.FLAGLENS_POLICY_PATH
  ? resolve(process.env.FLAGLENS_POLICY_PATH)
  : resolve(ROOT_DIR, "flaglens.policy.json");

// Reuse the backend credentials without duplicating secrets.
config({
  path: resolve(ROOT_DIR, "backend", ".env"),
});

const BASE_URL = (
  process.env.FLAGSMITH_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

const API_KEY = process.env.FLAGSMITH_API_KEY?.trim();

const PROJECT_ID = process.env.FLAGSMITH_PROJECT_ID || "1";

const ENVIRONMENT_KEYS = {
  Development: process.env.FLAGSMITH_DEVELOPMENT_ENV_KEY?.trim(),
  Production: process.env.FLAGSMITH_PRODUCTION_ENV_KEY?.trim(),
};

const program = new Command();

function list(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function printHeader(title) {
  console.log(`\n  FlagLens | ${title}`);
  console.log("  " + "─".repeat(54));
}

function printRow(label, value) {
  console.log(`  ${label.padEnd(25)} ${value}`);
}

async function apiGet(path) {
  if (!API_KEY) {
    throw new Error(
      "FLAGSMITH_API_KEY is missing. Configure it in backend/.env."
    );
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Api-Key ${API_KEY}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Flagsmith returned HTTP ${response.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  return data;
}

async function getContext(projectId = PROJECT_ID) {
  const id = Number(projectId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid project ID.");
  }

  const [projectData, environmentData, featureData] =
    await Promise.all([
      apiGet("/api/v1/projects/"),
      apiGet(`/api/v1/projects/${id}/environments/`),
      apiGet(`/api/v1/projects/${id}/features/`),
    ]);

  const project = list(projectData).find((item) => item.id === id);

  if (!project) {
    throw new Error(`Flagsmith project ${id} was not found.`);
  }

  const features = list(featureData).filter(
    (feature) => !feature.is_archived
  );

  const environments = await Promise.all(
    list(environmentData).map(async (environment) => {
      const key = ENVIRONMENT_KEYS[environment.name];

      if (!key) {
        return {
          id: environment.id,
          name: environment.name,
          connected: false,
          featureStates: [],
        };
      }

      const stateData = await apiGet(
        `/api/v1/environments/${encodeURIComponent(key)}/featurestates/`
      );

      return {
        id: environment.id,
        name: environment.name,
        connected: true,
        featureStates: list(stateData),
      };
    })
  );

  return { project, features, environments };
}

function getState(environment, featureId) {
  if (!environment?.connected) return null;

  const state = environment.featureStates.find(
    (item) =>
      item.feature === featureId &&
      item.identity === null &&
      item.feature_segment === null
  );

  return state ? state.enabled : null;
}

function analyze(context) {
  return analyzeReleaseRisk(context);
}

function enabledLabel(value) {
  if (value === null) return "Unknown";
  return value ? "Enabled" : "Disabled";
}

function safe(action) {
  return async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      console.error(`\n  Error: ${error.message}\n`);
      process.exitCode = 1;
    }
  };
}

program
  .name("flaglens")
  .description("Developer release governance for self-hosted Flagsmith")
  .version("1.0.0")
  .option(
    "-p, --project <id>",
    "Flagsmith project ID",
    PROJECT_ID
  );

program
  .command("projects")
  .description("List available Flagsmith projects")
  .action(safe(async () => {
    const data = await apiGet("/api/v1/projects/");

    printHeader("Flagsmith Projects");

    for (const project of list(data)) {
      printRow(project.name, `ID: ${project.id}`);
    }
  }));

program
  .command("environments")
  .description("List project environments")
  .action(safe(async () => {
    const { project, environments } = await getContext(
      program.opts().project
    );

    printHeader(`${project.name} | Environments`);

    for (const environment of environments) {
      printRow(
        environment.name,
        environment.connected ? "Connected" : "Key not configured"
      );
    }
  }));

program
  .command("flags")
  .description("List feature flags and their environment states")
  .action(safe(async () => {
    const context = await getContext(program.opts().project);
    const development = context.environments.find(
      (environment) => environment.name === "Development"
    );
    const production = context.environments.find(
      (environment) => environment.name === "Production"
    );

    printHeader(`${context.project.name} | Feature Inventory`);

    for (const feature of context.features) {
      const dev = getState(development, feature.id);
      const prod = getState(production, feature.id);

      console.log(`\n  ${feature.name}`);
      printRow("Development", enabledLabel(dev));
      printRow("Production", enabledLabel(prod));
    }

    console.log();
  }));

program
  .command("audit")
  .description("Compare environments and identify release risks")
  .action(safe(async () => {
    const context = await getContext(program.opts().project);
    const report = analyze(context);

    printHeader(`${context.project.name} | Release Audit`);

    printRow("Risk score", `${report.riskScore}/100`);
    printRow("Risk level", report.riskLevel);
    printRow("Total findings", report.totalFindings);
    printRow("High", report.severityCounts.high);
    printRow("Medium", report.severityCounts.medium);
    printRow("Low", report.severityCounts.low);

    if (report.findings.length === 0) {
      console.log("\n  No findings detected.");
    }

    for (const finding of report.findings) {
      console.log(`\n  [${finding.severity.toUpperCase()}] ${finding.title}`);
      console.log(`  Feature: ${finding.feature}`);
      console.log(`  ${finding.message}`);
      console.log(`  Recommendation: ${finding.recommendation}`);
      console.log(`  Risk points: +${finding.points}`);
    }

    console.log(
      "\n  Note: This is a policy-based heuristic, not a prediction of deployment failure.\n"
    );
  }));

program
  .command("report")
  .description("Generate a JSON or Markdown audit report")
  .option("-f, --format <format>", "json or markdown", "markdown")
  .action(safe(async (options) => {
    const format = options.format.toLowerCase();

    if (!["json", "markdown"].includes(format)) {
      throw new Error("Format must be json or markdown.");
    }

    const context = await getContext(program.opts().project);
    const risk = analyze(context);

    const report = {
      project: context.project.name,
      projectId: context.project.id,
      generatedAt: new Date().toISOString(),
      environments: context.environments.map((environment) => ({
        name: environment.name,
        connected: environment.connected,
      })),
      risk,
    };

    const extension = format === "json" ? "json" : "md";
    const outputPath = resolve(
      ROOT_DIR,
      `flaglens-report.${extension}`
    );

    const content = format === "json"
      ? JSON.stringify(report, null, 2)
      : [
          `# FlagLens Release Audit`,
          ``,
          `Project: ${report.project}`,
          `Project ID: ${report.projectId}`,
          `Generated: ${report.generatedAt}`,
          ``,
          `## Risk summary`,
          ``,
          `- Score: ${risk.riskScore}/100`,
          `- Level: ${risk.riskLevel}`,
          `- Findings: ${risk.totalFindings}`,
          ``,
          `## Findings`,
          ``,
          ...risk.findings.flatMap((finding) => [
            `### ${finding.title}: ${finding.feature}`,
            ``,
            `- Severity: ${finding.severity}`,
            `- Points: +${finding.points}`,
            `- Explanation: ${finding.message}`,
            `- Recommendation: ${finding.recommendation}`,
            ``,
          ]),
          `> This is a configurable heuristic, not a prediction of deployment failure.`,
        ].join("\n");

    writeFileSync(outputPath, content, "utf8");

    console.log(`\n  Report generated: ${outputPath}\n`);
  }));

const policyCommand = program
  .command("policy")
  .description("Manage release governance policies");

policyCommand
  .command("init")
  .description("Create a default release policy file")
  .action(safe(async () => {
    if (existsSync(POLICY_PATH)) {
      throw new Error("flaglens.policy.json already exists.");
    }

    const policy = {
      version: 1,
      rules: {
        blockProductionOnlyFlags: true,
        blockExperimentalFlagsInProduction: true,
        failOnMissingStates: true,
        maxMediumFindings: 5,
      },
    };

    writeFileSync(
      POLICY_PATH,
      JSON.stringify(policy, null, 2) + "\n",
      "utf8"
    );

    console.log(`\n  Policy created: ${POLICY_PATH}\n`);
  }));

policyCommand
  .command("check")
  .description("Evaluate release configurations against policies")
  .action(safe(async () => {
    if (!existsSync(POLICY_PATH)) {
      throw new Error("Policy file missing. Run: policy init");
    }

    let policy;
    try {
      policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
    } catch (error) {
      throw new Error(`Policy file is not valid JSON: ${error.message}`);
    }

    const policyErrors = validatePolicy(policy);
    if (policyErrors.length > 0) {
      throw new Error(`Invalid policy: ${policyErrors.join(" ")}`);
    }

    const context = await getContext(program.opts().project);
    const report = analyze(context);
    const result = evaluatePolicy(policy, report);

    printHeader("Release Policy Check");
    printRow("Analysis status", report.status);
    printRow("Risk score", report.riskScore === null ? "Unavailable" : `${report.riskScore}/100`);
    printRow("Findings", report.totalFindings ?? report.findings.length);
    printRow("Policy violations", result.violations.length);

    for (const violation of result.violations) {
      console.log(`  BLOCK: ${violation}`);
    }

    if (!result.passed) {
      console.log("\\n  RELEASE CHECK FAILED\\n");
      process.exitCode = 1;
    } else {
      console.log("\\n  RELEASE CHECK PASSED\\n");
    }
  }));


program
  .command("scan")
  .description("Scan a repository for Flagsmith feature references")
  .argument(
    "[directory]",
    "Repository directory",
    resolve(ROOT_DIR, "examples", "sample-app")
  )
  .option("--format <format>", "table or json", "table")
  .option("--strict", "Exit with an error when unknown feature references exist")
  .action(safe(async (directory, options) => {
    const format = options.format.toLowerCase();

    if (!["table", "json"].includes(format)) {
      throw new Error("Format must be table or json.");
    }

    const context = await getContext(program.opts().project);

    const result = scanRepository(
      directory,
      context.features
    );

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));

      if (options.strict && result.unknownReferences.length > 0) {
        process.exitCode = 1;
      }

      return;
    }

    printHeader("Repository Intelligence");

    printRow("Repository", result.repository);
    printRow("Files scanned", result.filesScanned);
    printRow("Total references", result.totalReferences);
    printRow("Unique referenced flags", result.uniqueReferencedFlags);
    printRow("Configured flags", result.configuredFlags);
    printRow("Unknown references", result.unknownReferences.length);
    printRow("Unreferenced flags", result.unreferencedFlags.length);

    for (const item of result.unknownReferences) {
      console.log(`\n  [HIGH] Unknown feature: ${item.feature}`);

      for (const location of item.locations) {
        console.log(`  ${location.file}:${location.line}`);
      }

      console.log(`  ${item.message}`);
    }

    for (const item of result.unreferencedFlags) {
      console.log(`\n  [MEDIUM] Unreferenced feature: ${item.feature}`);
      console.log(`  ${item.message}`);
    }

    console.log("\n  Source: Static repository analysis");
    console.log(
      "  Note: Unreferenced does not automatically mean stale or safe to delete.\n"
    );

    if (options.strict && result.unknownReferences.length > 0) {
      console.log("  SCAN FAILED: Unknown feature references detected.\n");
      process.exitCode = 1;
    } else {
      console.log("  SCAN COMPLETED.\n");
    }
  }));


await program.parseAsync(process.argv);
