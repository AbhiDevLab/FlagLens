
import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";

import {
  extname,
  relative,
  resolve,
} from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
]);

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".vite",
]);

export function scanRepository(rootDirectory, features) {
  const root = resolve(rootDirectory);

  if (!existsSync(root)) {
    throw new Error(`Repository path does not exist: ${root}`);
  }

  const definitions = features.filter(
    (feature) => !feature.is_archived
  );

  const knownFlags = new Set(
    definitions.map((feature) => feature.name)
  );

  const references = new Map();
  let filesScanned = 0;

  // Detect literal Flagsmith feature-key references.
  const pattern =
    /\b(?:(?:flagsmith|featureFlags|flags)\s*\.\s*)?(?:hasFeature|getValue|isFeatureEnabled)\s*\(\s*(["'`])([^"'`]+)\1\s*\)/g;

  function visit(directory) {
    const entries = readdirSync(directory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          visit(fullPath);
        }

        continue;
      }

      if (!entry.isFile()) continue;

      if (!SOURCE_EXTENSIONS.has(extname(entry.name))) {
        continue;
      }

      const source = readFileSync(fullPath, "utf8");
      filesScanned++;

      pattern.lastIndex = 0;

      let match;

      while ((match = pattern.exec(source)) !== null) {
        const featureName = match[2];

        if (!references.has(featureName)) {
          references.set(featureName, []);
        }

        const line =
          source.slice(0, match.index).split("\n").length;

        references.get(featureName).push({
          file: relative(root, fullPath).replace(/\\/g, "/"),
          line,
        });
      }
    }
  }

  visit(root);

  const referenceNames = new Set(references.keys());

  const unknownReferences = [];

  for (const [name, locations] of references) {
    if (!knownFlags.has(name)) {
      unknownReferences.push({
        feature: name,
        severity: "high",
        locations,
        message: `Feature "${name}" is referenced in code but does not exist in Flagsmith.`,
      });
    }
  }

  const unreferencedFlags = definitions
    .filter((feature) => !referenceNames.has(feature.name))
    .map((feature) => ({
      feature: feature.name,
      severity: "medium",
      message: `Feature "${feature.name}" exists in Flagsmith but was not found in the scanned repository.`,
    }));

  return {
    repository: root,
    filesScanned,
    totalReferences: [...references.values()].reduce(
      (total, locations) => total + locations.length,
      0
    ),
    uniqueReferencedFlags: referenceNames.size,
    configuredFlags: definitions.length,
    unknownReferences,
    unreferencedFlags,
    references: Object.fromEntries(references),
    generatedAt: new Date().toISOString(),
  };
}
