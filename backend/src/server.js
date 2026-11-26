
import "dotenv/config";
import express from "express";
import cors from "cors";
import { analyzeReleaseRisk } from "./riskEngine.js";

const app = express();

const PORT = Number(process.env.PORT || 4000);
const BASE_URL = (
  process.env.FLAGSMITH_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

const API_KEY = process.env.FLAGSMITH_API_KEY?.trim();

const ENVIRONMENT_KEYS = {
  Development: process.env.FLAGSMITH_DEVELOPMENT_ENV_KEY?.trim(),
  Production: process.env.FLAGSMITH_PRODUCTION_ENV_KEY?.trim(),
};

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

function asList(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

async function flagsmithGet(path) {
  if (!API_KEY) {
    throw new Error("Flagsmith organisation API token is missing.");
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
      `Flagsmith HTTP ${response.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  return data;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "FlagLens API",
    flagsmith: BASE_URL,
  });
});

// Organisations
app.get("/api/flagsmith/organisations", async (_req, res) => {
  try {
    res.json(await flagsmithGet("/api/v1/organisations/"));
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Projects
app.get("/api/flagsmith/projects", async (_req, res) => {
  try {
    res.json(await flagsmithGet("/api/v1/projects/"));
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Project environments
app.get("/api/flagsmith/projects/:projectId/environments", async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!/^\d+$/.test(projectId)) {
      return res.status(400).json({ error: "Invalid project ID." });
    }

    const data = await flagsmithGet(
      `/api/v1/projects/${projectId}/environments/`
    );

    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Project feature definitions
app.get("/api/flagsmith/projects/:projectId/features", async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!/^\d+$/.test(projectId)) {
      return res.status(400).json({ error: "Invalid project ID." });
    }

    const data = await flagsmithGet(
      `/api/v1/projects/${projectId}/features/`
    );

    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Individual environment feature states
app.get(
  "/api/flagsmith/environments/:environmentKey/featurestates",
  async (req, res) => {
    try {
      const key = req.params.environmentKey;

      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        return res.status(400).json({ error: "Invalid environment key." });
      }

      const data = await flagsmithGet(
        `/api/v1/environments/${encodeURIComponent(key)}/featurestates/`
      );

      res.json(data);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  }
);

// Complete project overview with Release Risk Intelligence
app.get("/api/flagsmith/overview/:projectId", async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID." });
    }

    // Fetch core Flagsmith resources concurrently
    const [
      organisationData,
      projectData,
      environmentData,
      featureData,
    ] = await Promise.all([
      flagsmithGet("/api/v1/organisations/"),
      flagsmithGet("/api/v1/projects/"),
      flagsmithGet(`/api/v1/projects/${projectId}/environments/`),
      flagsmithGet(`/api/v1/projects/${projectId}/features/`),
    ]);

    const project = asList(projectData).find(
      (item) => item.id === projectId
    );

    if (!project) {
      return res.status(404).json({
        error: "Project not found.",
      });
    }

    const organisation = asList(organisationData).find(
      (item) => item.id === project.organisation
    );

    // Retrieve actual environment-specific feature states
    const environments = await Promise.all(
      asList(environmentData).map(async (environment) => {
        const key = ENVIRONMENT_KEYS[environment.name];

        if (!key) {
          return {
            id: environment.id,
            name: environment.name,
            connected: false,
            featureStates: [],
            message: "Environment key not configured.",
          };
        }

        try {
          const stateData = await flagsmithGet(
            `/api/v1/environments/${encodeURIComponent(key)}/featurestates/`
          );

          return {
            id: environment.id,
            name: environment.name,
            connected: true,
            featureStates: asList(stateData),
          };
        } catch (error) {
          return {
            id: environment.id,
            name: environment.name,
            connected: false,
            featureStates: [],
            message: error.message,
          };
        }
      })
    );

    // Build the verified live Flagsmith overview
    const overview = {
      organisation: organisation ?? null,
      project,
      environments,
      features: asList(featureData),
      generatedAt: new Date().toISOString(),
    };

    // Analyse actual environment configurations
    const risk = analyzeReleaseRisk(overview);

    // Return live data and risk analysis together
    res.json({
      ...overview,
      risk,
    });

  } catch (error) {
    console.error("FlagLens overview error:", error);

    res.status(502).json({
      error: error.message || "Unable to generate project overview.",
    });
  }
});

// Start backend
app.listen(PORT, () => {
  console.log(`FlagLens API running at http://localhost:${PORT}`);
  console.log(`Flagsmith instance: ${BASE_URL}`);
  console.log("Release Risk Intelligence: Enabled");
});
