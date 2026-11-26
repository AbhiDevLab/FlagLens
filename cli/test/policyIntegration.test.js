import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
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

async function runPolicyCheck(fixture, productionKey = "prod-mock-key") {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;

    const routes = {
      "/api/v1/projects/": [
        { id: 1, name: "FlagLens Integration Test" },
      ],
      "/api/v1/projects/1/environments/": [
        { id: 1, name: "Development" },
        { id: 2, name: "Production" },
      ],
      "/api/v1/projects/1/features/": fixture.features,
    };

    let body = routes[pathname];

    if (pathname ===
        "/api/v1/environments/dev-mock-key/featurestates/") {
      body = fixture.developmentStates;
    }

    if (pathname ===
        "/api/v1/environments/prod-mock-key/featurestates/") {
      body = fixture.productionStates;
    }

    if (body === undefined) {
      response.writeHead(404);
      response.end(JSON.stringify({ error: "Unknown mock endpoint" }));
      return;
    }

    response.writeHead(200, {
      "Content-Type": "application/json",
    });

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
    const child = spawn(
      process.execPath,
      [
        CLI_ENTRY,
        "--project",
        "1",
        "policy",
        "check",
      ],
      {
        cwd: ROOT_DIR,
        env: {
          ...process.env,
          FLAGSMITH_BASE_URL: `http://127.0.0.1:${address.port}`,
          FLAGSMITH_API_KEY: "integration-test-token",
          FLAGSMITH_PROJECT_ID: "1",
          FLAGSMITH_DEVELOPMENT_ENV_KEY: "dev-mock-key",
          FLAGSMITH_PRODUCTION_ENV_KEY: productionKey,
          FLAGLENS_POLICY_PATH: POLICY_PATH,
        },
      }
    );

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const result = await new Promise((resolveResult, rejectResult) => {
      child.once("error", rejectResult);

      child.once("close", (code, signal) => {
        resolveResult({ code, signal });
      });
    });

    return {
      ...result,
      output: stdout + stderr,
    };
  } finally {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    });
  }
}

test("CLI blocks production-only feature flags", async () => {
  const result = await runPolicyCheck({
    features: [{ id: 1, name: "payments" }],
    developmentStates: [state(1, false)],
    productionStates: [state(1, true)],
  });

  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /Production-only feature flags are not permitted/);
  assert.match(result.output, /RELEASE CHECK FAILED/);
});

test("CLI blocks experimental features enabled in Production", async () => {
  const result = await runPolicyCheck({
    features: [{ id: 1, name: "experimental_checkout" }],
    developmentStates: [state(1, true)],
    productionStates: [state(1, true)],
  });

  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /Experimental feature enabled in Production/);
  assert.match(result.output, /RELEASE CHECK FAILED/);
});

test("CLI blocks missing environment feature states", async () => {
  const result = await runPolicyCheck({
    features: [{ id: 1, name: "user_dashboard" }],
    developmentStates: [],
    productionStates: [state(1, true)],
  });

  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /Missing environment feature states detected/);
  assert.match(result.output, /RELEASE CHECK FAILED/);
});

test("CLI blocks incomplete environment analysis", async () => {
  const result = await runPolicyCheck({
    features: [{ id: 1, name: "user_dashboard" }],
    developmentStates: [state(1, true)],
    productionStates: [state(1, true)],
  }, "");

  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /Release analysis is incomplete/);
  assert.match(result.output, /RELEASE CHECK FAILED/);
});

test("CLI approves clean valid configurations", async () => {
  const result = await runPolicyCheck({
    features: [{ id: 1, name: "stable_dashboard" }],
    developmentStates: [state(1, true)],
    productionStates: [state(1, true)],
  });

  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /RELEASE CHECK PASSED/);
  assert.match(result.output, /Policy violations\s+0/);
});