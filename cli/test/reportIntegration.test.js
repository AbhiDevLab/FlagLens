import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, "../..");
const CLI_ENTRY = resolve(ROOT_DIR, "cli/src/index.js");
const POLICY_PATH = resolve(ROOT_DIR, "flaglens.policy.json");

const state = (feature, enabled) => ({
  feature,
  enabled,
  identity: null,
  feature_segment: null,
});

async function runReport(source, strict = true) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "flaglens-report-"));
  const scanDirectory = join(temporaryRoot, "application");
  const outputDirectory = join(temporaryRoot, "artifacts");

  mkdirSync(scanDirectory);
  writeFileSync(join(scanDirectory, "features.ts"), source, "utf8");

  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const routes = {
      "/api/v1/projects/": [
        { id: 1, name: "FlagLens Report Integration Test" },
      ],
      "/api/v1/projects/1/environments/": [
        { id: 1, name: "Development" },
        { id: 2, name: "Production" },
      ],
      "/api/v1/projects/1/features/": [
        { id: 1, name: "known_flag" },
      ],
      "/api/v1/environments/dev-mock-key/featurestates/": [
        state(1, true),
      ],
      "/api/v1/environments/prod-mock-key/featurestates/": [
        state(1, true),
      ],
    };

    const body = routes[pathname];

    if (body === undefined) {
      response.writeHead(404);
      response.end(JSON.stringify({ error: "Unknown mock endpoint" }));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine mock server port.");
  }

  let stdout = "";
  let stderr = "";

  try {
    const args = [
      CLI_ENTRY,
      "--project",
      "1",
      "report",
      "--format",
      "both",
      "--scan-path",
      scanDirectory,
      "--output-dir",
      outputDirectory,
    ];

    if (strict) args.push("--strict");

    const child = spawn(process.execPath, args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        FLAGSMITH_BASE_URL: `http://127.0.0.1:${address.port}`,
        FLAGSMITH_API_KEY: "integration-test-token",
        FLAGSMITH_PROJECT_ID: "1",
        FLAGSMITH_DEVELOPMENT_ENV_KEY: "dev-mock-key",
        FLAGSMITH_PRODUCTION_ENV_KEY: "prod-mock-key",
        FLAGLENS_POLICY_PATH: POLICY_PATH,
      },
    });

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const result = await new Promise((resolveResult, rejectResult) => {
      child.once("error", rejectResult);
      child.once("close", (code, signal) => resolveResult({ code, signal }));
    });

    const jsonPath = join(outputDirectory, "flaglens-report.json");
    const markdownPath = join(outputDirectory, "flaglens-report.md");

    return {
      ...result,
      output: stdout + stderr,
      jsonExists: existsSync(jsonPath),
      markdownExists: existsSync(markdownPath),
      json: existsSync(jsonPath)
        ? JSON.parse(readFileSync(jsonPath, "utf8"))
        : null,
      markdown: existsSync(markdownPath)
        ? readFileSync(markdownPath, "utf8")
        : "",
    };
  } finally {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    });
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

test("report command writes JSON and Markdown before blocking unknown references", async () => {
  const result = await runReport(
    [
      'flagsmith.hasFeature("known_flag");',
      'flagsmith.hasFeature("unknown_gateway");',
    ].join("\n")
  );

  assert.equal(result.code, 1, result.output);
  assert.equal(result.jsonExists, true);
  assert.equal(result.markdownExists, true);
  assert.equal(result.json.status, "blocked");
  assert.equal(result.json.scanner.filesScanned, 1);
  assert.equal(result.json.scanner.unknownReferences[0].feature, "unknown_gateway");
  assert.equal(result.json.policy.passed, false);
  assert.match(result.markdown, /unknown_gateway/);
  assert.match(result.markdown, /RELEASE BLOCKED|BLOCKED/);
});

test("report command approves a clean scan and writes both formats", async () => {
  const result = await runReport('flagsmith.hasFeature("known_flag");');

  assert.equal(result.code, 0, result.output);
  assert.equal(result.jsonExists, true);
  assert.equal(result.markdownExists, true);
  assert.equal(result.json.status, "approved");
  assert.equal(result.json.scanner.unknownReferences.length, 0);
  assert.equal(result.json.policy.passed, true);
  assert.match(result.markdown, /RELEASE APPROVED|APPROVED/);
});
