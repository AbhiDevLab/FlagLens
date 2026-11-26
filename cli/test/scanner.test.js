import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository } from "../src/scanner.js";

test("detects known and unknown literal feature references with line numbers", () => {
  const root = mkdtempSync(join(tmpdir(), "flaglens-scan-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "app.ts"), [
      'flagsmith.hasFeature("known_flag");',
      'flagsmith.hasFeature("missing_flag");',
    ].join("\n"));
    const result = scanRepository(root, [{ id: 1, name: "known_flag" }]);
    assert.equal(result.filesScanned, 1);
    assert.equal(result.totalReferences, 2);
    assert.equal(result.unknownReferences.length, 1);
    assert.equal(result.unknownReferences[0].feature, "missing_flag");
    assert.equal(result.unknownReferences[0].locations[0].line, 2);
    assert.equal(result.unreferencedFlags.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports configured flags that are not referenced", () => {
  const root = mkdtempSync(join(tmpdir(), "flaglens-scan-"));
  try {
    writeFileSync(join(root, "app.js"), 'flagsmith.hasFeature("used_flag");');
    const result = scanRepository(root, [
      { id: 1, name: "used_flag" },
      { id: 2, name: "unused_flag" },
    ]);
    assert.equal(result.unknownReferences.length, 0);
    assert.equal(result.unreferencedFlags.length, 1);
    assert.equal(result.unreferencedFlags[0].feature, "unused_flag");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores generated and dependency directories", () => {
  const root = mkdtempSync(join(tmpdir(), "flaglens-scan-"));
  try {
    mkdirSync(join(root, "node_modules"), { recursive: true });
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "node_modules", "dep.js"), 'flagsmith.hasFeature("unknown_dep");');
    writeFileSync(join(root, "dist", "bundle.js"), 'flagsmith.hasFeature("unknown_bundle");');
    const result = scanRepository(root, []);
    assert.equal(result.filesScanned, 0);
    assert.equal(result.unknownReferences.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a missing repository path", () => {
  assert.throws(() => scanRepository(join(tmpdir(), "flaglens-does-not-exist"), []), /does not exist/);
});
