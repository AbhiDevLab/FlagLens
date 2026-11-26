# FlagLens Guard

### Release Governance Toolkit for Self-Hosted Flagsmith

FlagLens Guard is an open-source developer tool built around self-hosted Flagsmith. It helps development teams inspect feature flags, identify environment configuration differences, audit source-code references and enforce configurable release policies.

## Features

### Web Dashboard
- Live Flagsmith organisation and project information.
- Development and Production environment comparison.
- Feature flag inventory.
- Configuration drift visibility.
- Release risk analysis and recommendations.

### FlagLens CLI
- List Flagsmith projects and environments.
- Inspect feature flags.
- Compare environment configurations.
- Generate unified JSON and Markdown release-governance reports.
- Evaluate configurable release policies.
- Scan JavaScript and TypeScript repositories for feature references.
- Enforce strict release checks in CI.

### Repository Intelligence
- Parse JavaScript and TypeScript with the TypeScript compiler API.
- Detect literal and constant-variable keys, aliased SDK methods and supported wrapper functions.
- Report unresolved dynamic keys separately for manual review.
- Identify configured flags not found in scanned source files.
- Report source paths, line numbers and SDK methods.
- Exclude generated/dependency directories and surface parse warnings.
- Strict mode for CI validation.

### Release Governance
- Deterministic, configurable risk heuristics.
- Policy-based release decisions.
- Human-reviewed remediation recommendations.
- GitHub Actions integration with JSON and Markdown audit artifacts.

## Architecture
- Frontend: React, TypeScript, Vite.
- Backend: Node.js, Express.
- CLI: Node.js, Commander.
- Integration: Flagsmith Management API.
- Infrastructure: Docker, PostgreSQL and self-hosted Flagsmith.

## Requirements
- Node.js 24 or later.
- npm.
- Git.
- Docker Engine and Docker Compose.
- A running self-hosted Flagsmith instance.

## Setup

### 1. Set up Flagsmith

Follow the official self-hosting instructions:

https://docs.flagsmith.com/deployment-self-hosting/hosting-guides/docker

Start your local Flagsmith instance and create a project with Development and Production environments. Create feature flags and an organisation API token.

### 2. Clone FlagLens

```bash
git clone https://github.com/AbhiDevLab/FlagLens.git
cd FlagLens
```

### 3. Configure backend credentials

Copy the environment template:

Windows CMD:
```cmd
copy backend\.env.example backend\.env
```

Linux/macOS:
```bash
cp backend/.env.example backend/.env
```

Populate the environment variables:

| Variable | Description |
|---|---|
| PORT | Backend port |
| FLAGSMITH_BASE_URL | Self-hosted Flagsmith URL |
| FLAGSMITH_API_KEY | Organisation Management API token |
| FLAGSMITH_DEVELOPMENT_ENV_KEY | Development client-side environment key |
| FLAGSMITH_PRODUCTION_ENV_KEY | Production client-side environment key |

The CLI reads Flagsmith credentials from `backend/.env`. Never commit this file or expose the organisation API token in frontend code.

### 4. Install dependencies

Backend:
```bash
cd backend
npm ci
npm run dev
```

Frontend, in another terminal:
```bash
cd frontend
npm ci
npm run dev
```

CLI, in another terminal:
```bash
cd cli
npm ci
```

### 5. Open the dashboard

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- Flagsmith: http://localhost:8000

## CLI Usage

Run commands from the `cli` directory. The CLI uses `backend/.env` for Flagsmith credentials and the repository-root `flaglens.policy.json` for policy evaluation.

List projects, environments and flags:

```bash
npm start -- projects
npm start -- environments
npm start -- flags
```

Run a release risk audit:

```bash
npm start -- audit
```

Initialize and evaluate the release policy:

```bash
npm start -- policy init
npm start -- policy check
```

Scan a repository:

```bash
npm start -- scan ../examples/clean-app
npm start -- scan ../examples/clean-app --format json
npm start -- scan ../examples/clean-app --strict
```

Generate the unified release-governance report:

```bash
npm start -- report --format markdown --scan-path ../examples/clean-app
npm start -- report --format json --scan-path ../examples/clean-app
npm start -- report --format both --scan-path ../examples/clean-app
```

The report command supports:

| Option | Purpose |
|---|---|
| `--format json` | Write `flaglens-report.json` |
| `--format markdown` | Write `flaglens-report.md` |
| `--format both` | Write both report formats |
| `--scan-path <directory>` | Include repository scanner evidence |
| `--strict` | Block when unknown feature references are detected |
| `--output-dir <directory>` | Choose the report output directory |

Example: generate both reports and enforce strict scanning:

```bash
npm start -- report --format both --scan-path ../examples/clean-app --strict --output-dir ./reports
```

Reports combine project and environment context, risk findings, scanner evidence, policy evaluation, release status and remediation recommendations. Reports are written before a blocking exit code is returned, so CI can retain evidence for rejected releases.

A report without `--scan-path` is marked incomplete because repository scanning was not requested. A blocked report exits with code 1. A successful report means the configured checks passed; it is not a guarantee that deployment is safe.

## Risk Scoring

FlagLens currently uses deterministic, configurable heuristic rules:

- Development enabled and Production disabled: +15.
- Production enabled and Development disabled: +35.
- Experimental or debug-named flag enabled in Production: +25.
- Missing global environment state: +10.

The score is capped at 100. These rules are review indicators, not predictions of deployment failure. They do not automatically modify Flagsmith configurations.

## Repository Scanner Scope and Limitations

The current scanner searches JavaScript and TypeScript-family files (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.vue`, and `.svelte`) for supported literal calls such as `hasFeature("flag")`, `getValue("flag")` and `isFeatureEnabled("flag")`.

Common generated and dependency directories such as `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next` and `.vite` are excluded.

This is static pattern matching, not a complete JavaScript/TypeScript parser. Dynamic feature keys, computed expressions, aliases, indirect wrappers, unsupported SDK methods and references assembled at runtime may not be detected. Review scanner output alongside the application code. An unreferenced flag is not automatically stale or safe to delete.

## GitHub Actions

The repository includes:
- A quality workflow that runs CLI/scanner tests, backend tests, frontend lint and a production build.
- A manually triggered Windows self-hosted Release Guard workflow.
- A composite action that generates JSON and Markdown audit reports and uploads them as workflow artifacts, including when strict enforcement blocks a release.

To run the Release Guard:
1. Open **Actions → FlagLens Release Guard**.
2. Select **Run workflow** on the branch you want to validate.
3. Choose `examples/clean-app` to demonstrate an approval or `examples/negative-app` to demonstrate strict blocking.
4. Open the completed run and download the `flaglens-audit-<run-id>` artifact.

The workflow requires a trusted Windows x64 self-hosted runner with access to the configured Flagsmith instance. Configure `FLAGSMITH_API_KEY`, `FLAGSMITH_DEVELOPMENT_ENV_KEY` and `FLAGSMITH_PRODUCTION_ENV_KEY` as GitHub Actions secrets. The workflow currently uses the Flagsmith endpoint `http://127.0.0.1:8000`; ensure the service is reachable from the runner.

Do not expose a personal self-hosted runner to untrusted public pull-request workflows. For GitHub-hosted runners, configure a securely reachable Flagsmith instance and adapt the runner configuration.

## Security
- Keep organisation API tokens server-side.
- Store credentials in environment variables or GitHub Secrets.
- Never commit `.env` files.
- Review release recommendations before changing production flags.
- No automatic production promotion or deletion is performed.

## Project Status

This project is under active development for Toggle Wars – Build on Open Source Flagsmith.

## License

MIT
