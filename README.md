[![Build and deploy UiPath Coded App](https://github.com/mthsbyw/SupportTicketDashboard/actions/workflows/deploy.yml/badge.svg)](https://github.com/mthsbyw/SupportTicketDashboard/actions/workflows/deploy.yml)

# Support Ticket Dashboard

A public demo of a **UiPath Coded Web App** built with React, TypeScript, and Vite. The app provides a support-ticket workspace backed by UiPath Data Fabric and demonstrates how a modern frontend can use the UiPath TypeScript SDK to read, create, filter, sort, and analyze business records.

## What this demo shows

- UiPath Coded Web App development with React and TypeScript
- UiPath Data Fabric entity and record access through the UiPath TypeScript SDK
- Ticket search across subject, assignee, status, priority, and category
- Status filtering, sorting, pagination, and ticket-age indicators
- Ticket creation with schema validation and trimmed input values
- Support-ticket analytics and responsive UI behavior
- Automated linting, testing, code analysis, packaging, publishing, and deployment

## Technology stack

- React
- TypeScript
- Vite
- [`@uipath/uipath-typescript`](https://www.npmjs.com/package/@uipath/uipath-typescript)
- UiPath Apollo UI packages
- Vitest with V8 coverage
- Oxlint
- GitHub Actions
- SonarQube Cloud

## Repository structure

```text
src/
├── App.tsx                    Main application UI and ticket interactions
├── components/                Reusable UI components and analytics
├── data/tickets.ts            Data Fabric access and ticket-domain helpers
├── data/tickets.test.ts       Unit tests for ticket-domain helpers
└── hooks/useAuth.tsx          UiPath authentication provider and hook

.github/workflows/deploy.yml   CI/CD workflow
sonar-project.properties       SonarQube Cloud project and coverage settings
vitest.config.ts               Vitest and LCOV configuration
vite.config.ts                Vite and UiPath Coded Apps configuration
uipath.json                   Local UiPath app runtime configuration
```

## Run locally

### Prerequisites

- Node.js 20 or a compatible later LTS release
- npm
- Access to a UiPath environment configured for this app
- Permission to use the configured Data Fabric entity when running the app

Install dependencies:

```bash
npm ci
```

Start the Vite development server:

```bash
npm run dev
```

The local app normally starts at `http://localhost:5173`. Authentication and Data Fabric access are handled by the UiPath Coded Apps development tooling and the local app configuration.

Do not add access tokens, client secrets, private keys, or other credentials to source files, `uipath.json`, `.env` files, or commits. Use the appropriate local authentication flow and repository or organization secret store instead.

## Local validation commands

```bash
# Run the production TypeScript/Vite build
npm run build

# Run unit tests
npm test

# Run unit tests and generate coverage/lcov.info
npm run test:coverage

# Run Oxlint
npm run lint
```

The current automated coverage focuses on the tested ticket-data layer. React `.tsx` files remain included in SonarQube code-quality analysis, while `src/**/*.tsx` is excluded from the coverage denominator until component-level tests are added.

## CI/CD workflow

The workflow is defined in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

It runs for:

- Pull requests targeting `main`
- Pushes to `main`
- Manual `workflow_dispatch` runs

### Build and quality checks

The build job performs these checks in order:

1. Checks out the complete Git history for analysis.
2. Installs dependencies with `npm ci`.
3. Runs `npm run lint`.
4. Runs `npm run build`.
5. Runs `npm run test:coverage` and generates an LCOV report.
6. Runs the SonarQube Cloud scan with a blocking quality gate.
7. Verifies that `dist/index.html` exists.
8. Calculates a bounded package version from the GitHub Actions run number and attempt.
9. Packs the built app and creates a SHA-256 checksum.
10. Uploads the tested package as a workflow artifact.

### Publish and deploy

For pushes to `main` and manual runs on `main`, the publish/deploy job then:

1. Downloads the exact tested package artifact.
2. Verifies its checksum.
3. Authenticates to UiPath using GitHub Actions secrets.
4. Publishes the exact package version to the configured tenant feed.
5. Deploys that exact version to the configured UiPath folder.

Deployment does not run for pull requests. The SonarQube quality gate runs before packaging and deployment, so a failed gate prevents the app from being published or deployed.

## GitHub Actions configuration

The workflow expects the following values to be configured in GitHub Actions. Only the names are documented here; credential values do not belong in the repository.

### Repository secrets

- `SONAR_TOKEN`
- `UIPATH_CLIENT_ID`
- `UIPATH_CLIENT_SECRET`

### Repository or environment variables

- `UIPATH_ORGANIZATION`
- `UIPATH_TENANT`
- `UIPATH_FOLDER_KEY`

The production deployment job uses the `uipath-production` environment. GitHub environment protection rules can be used to require approval before deployment.

## SonarQube Cloud

SonarQube configuration is stored in [`sonar-project.properties`](sonar-project.properties). The workflow:

- Generates `coverage/lcov.info` before scanning.
- Classifies colocated `*.test.ts` and `*.test.tsx` files as tests.
- Keeps application source files available for code-quality analysis.
- Waits for the SonarQube quality-gate result and fails the build when the gate fails.

The SonarQube Cloud project must use the same main branch as this repository: `main`.

## Security and public-repository notes

- Never commit `SONAR_TOKEN`, UiPath client secrets, access tokens, private keys, or local credential files.
- Public configuration may describe the application and workflow, but environment-specific credentials and deployment settings should remain in GitHub Secrets or Variables.
- The workflow uses pinned GitHub Action commit SHAs for its third-party actions.
- The UiPath publish/deploy job consumes the package produced and checksummed by the build job; it does not rebuild a different package during deployment.
