

\# FlagLens Guard



\### Release Governance Toolkit for Self-Hosted Flagsmith



FlagLens Guard is an open-source developer tool built around self-hosted Flagsmith. It helps development teams inspect feature flags, identify environment configuration differences, audit source-code references and enforce configurable release policies.



\## Features



\### Web Dashboard

\- Live Flagsmith organisation and project information.

\- Development and Production environment comparison.

\- Feature flag inventory.

\- Configuration drift visibility.

\- Release risk analysis and recommendations.



\### FlagLens CLI

\- List Flagsmith projects and environments.

\- Inspect feature flags.

\- Compare environment configurations.

\- Generate Markdown and JSON reports.

\- Evaluate configurable release policies.

\- Scan JavaScript and TypeScript repositories for feature references.



\### Repository Intelligence

\- Detect feature references missing from Flagsmith.

\- Identify configured flags not found in the scanned source files.

\- Report file paths and line numbers.

\- Strict mode for CI validation.



\### Release Governance

\- Deterministic policy-based risk scoring.

\- Configurable release rules.

\- Human-reviewed release recommendations.

\- GitHub Actions integration (experimental).



\## Architecture



\- Frontend: React, TypeScript, Vite.

\- Backend: Node.js, Express.

\- CLI: Node.js, Commander.

\- Integration: Flagsmith Management API.

\- Infrastructure: Docker, PostgreSQL and self-hosted Flagsmith.



\## Requirements



\- Node.js 24 or later.

\- npm.

\- Git.

\- Docker Engine and Docker Compose.

\- A running self-hosted Flagsmith instance.



\## Setup



\### 1. Set up Flagsmith



Follow the official self-hosting instructions:



https://docs.flagsmith.com/deployment-self-hosting/hosting-guides/docker



Start your local Flagsmith instance and create a project with Development and Production environments.



Create feature flags and an organisation API token.



\### 2. Clone FlagLens



```bash

git clone https://github.com/OWNER/FlagLens.git

cd FlagLens

```



Replace OWNER with the repository owner's GitHub username.



\### 3. Configure backend credentials



Copy the environment template:



```bash

copy backend\\.env.example backend\\.env

```



On Linux or macOS, use:



```bash

cp backend/.env.example backend/.env

```



Populate the environment variables:



| Variable | Description |

|---|---|

| PORT | Backend port |

| FLAGSMITH\_BASE\_URL | Self-hosted Flagsmith URL |

| FLAGSMITH\_API\_KEY | Organisation Management API token |

| FLAGSMITH\_DEVELOPMENT\_ENV\_KEY | Development client-side environment key |

| FLAGSMITH\_PRODUCTION\_ENV\_KEY | Production client-side environment key |



Never commit backend/.env or expose the organisation API token in frontend code.



\### 4. Install dependencies



Backend:



```bash

cd backend

npm install

npm run dev

```



Frontend, in another terminal:



```bash

cd frontend

npm install

npm run dev

```



\### 5. Open the dashboard



http://localhost:5173



Backend API:



http://localhost:4000



Flagsmith:



http://localhost:8000



\## CLI Usage



From the cli directory:



```bash

cd cli

npm install

```



List projects:



```bash

npm start -- projects

```



List environments:



```bash

npm start -- environments

```



List feature flags:



```bash

npm start -- flags

```



Run a release audit:



```bash

npm start -- audit

```



Generate reports:



```bash

npm start -- report --format markdown

npm start -- report --format json

```



Initialize release policies:



```bash

npm start -- policy init

```



Evaluate release policies:



```bash

npm start -- policy check

```



Scan a repository:



```bash

npm start -- scan ../examples/clean-app

```



Enable strict mode:



```bash

npm start -- scan ../examples/clean-app --strict

```



Export scan results:



```bash

npm start -- scan ../examples/clean-app --format json

```



\## Risk Scoring



FlagLens currently uses deterministic, configurable heuristic rules.



\- Development enabled and Production disabled: +15.

\- Production enabled and Development disabled: +35.

\- Experimental or debug-named flag enabled in Production: +25.

\- Missing global environment state: +10.



The score is capped at 100.



These rules are review indicators, not predictions of deployment failure. They do not automatically modify Flagsmith configurations.



\## Repository Scanner Limitations



The initial scanner supports literal feature-key calls such as hasFeature(), getValue() and isFeatureEnabled() in supported JavaScript and TypeScript source files.



Dynamic feature keys, indirect wrappers and unsupported SDK access patterns may not be detected.



An unreferenced flag is not automatically safe to delete.



\## GitHub Actions



The repository contains an experimental composite GitHub Action and a manually triggered Windows self-hosted runner workflow.



The current workflow requires a trusted runner with access to the configured Flagsmith instance.



Do not expose a personal self-hosted runner to untrusted public pull-request workflows. For GitHub-hosted runners, configure a securely reachable Flagsmith instance.



\## Security



\- Keep organisation API tokens server-side.

\- Store credentials in environment variables or GitHub Secrets.

\- Never commit .env files.

\- Review release recommendations before changing production flags.

\- No automatic production promotion or deletion is performed.



\## Project Status



This project is under active development for Toggle Wars – Build on Open Source Flagsmith.



\## License



MIT



