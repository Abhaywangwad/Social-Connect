# Social Connect — Continuous Integration (CI) Architecture & Operations Guide

This document outlines the Continuous Integration (CI) pipeline for the **Social Connect** repository using GitHub Actions.

---

## 1. CI Pipeline Architecture

The workflow is located at [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It automatically runs on every push and pull request, executing tests, static analysis, contract validation, and container builds across isolated runner environments.

```text
                             Git Push / Pull Request
                                       │
                                       ▼
                             GitHub Actions Runner
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
   [ Backend Tests ]           [ Frontend Build ]         [ OpenAPI Docs ]
   • MongoDB 7.0 Service       • Node 20 LTS              • Node 20 LTS
   • npm ci                    • npm ci                   • npm ci
   • npm audit                 • npm audit                • test_docs_validation.js
   • npm run test:coverage     • npm run lint (oxlint)    • 73 REST Operations
   • Coverage Artifact         • npm run build (Vite)     • 187 $ref Pointers
            │                          │                          │
            └──────────────────────────┼──────────────────────────┘
                                       │ (all 3 pass)
                                       ▼
                           [ Docker Image Build ]
                           • Docker Buildx
                           • server/Dockerfile
                           • Multi-stage OCI Image
                                       │
                                       ▼
                                 CI Status: PASS
```

---

## 2. Triggers & Branch Strategy

The CI workflow triggers automatically for:

```yaml
on:
  push:
    branches:
      - main
      - 'feature/**'
      - 'bugfix/**'
  pull_request:
    branches:
      - main
```

### Concurrency & Cancellation
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
When a developer pushes consecutive commits to the same branch or pull request, running jobs for earlier commits are automatically cancelled to conserve GitHub Actions runner minutes.

### Least-Privilege Permissions
```yaml
permissions:
  contents: read
```
The workflow operates strictly under read-only access. It cannot modify branches, push tags, or access repository write APIs.

---

## 3. Job Specifications

### Job 1: `backend-test` (Backend Tests & Coverage)
- **Runner**: `ubuntu-latest`
- **Service Container**: `mongo:7.0` on port 27017 with internal health checks.
- **Node.js**: Version 20 LTS with `npm` caching keyed to `server/package-lock.json`.
- **Steps**:
  1. `npm ci`: Clean, reproducible dependency installation from lockfile.
  2. `npm audit --omit=dev --audit-level=high`: Dependency security scan checking production packages for high or critical CVEs.
  3. `npm run test:coverage`: Executes all 102 automated backend tests across Unit, Integration, Security, and Socket.IO suites.
  4. `actions/upload-artifact@v4`: Uploads the generated `server/coverage/` directory with a 14-day retention window.

### Job 2: `frontend-build` (Frontend Lint & Build)
- **Runner**: `ubuntu-latest`
- **Node.js**: Version 20 LTS with `npm` caching keyed to `client/package-lock.json`.
- **Steps**:
  1. `npm ci`: Clean client dependency tree installation.
  2. `npm audit --omit=dev --audit-level=high`: Client production package vulnerability scan.
  3. `npm run lint`: Fast AST linting via `oxlint` ensuring syntax correctness and catching unused imports.
  4. `npm run build`: Production bundle compilation via Vite verifying zero build or asset bundling errors.

### Job 3: `api-docs-validation` (OpenAPI & Docs Validation)
- **Runner**: `ubuntu-latest`
- **Node.js**: Version 20 LTS with `npm` caching.
- **Steps**:
  1. `npm ci`: Server dependency setup.
  2. `npm run validate:docs`: Executes `server/test_docs_validation.js`, ensuring:
     - `docs/openapi.yaml` parses valid YAML.
     - All 73 REST operations have unique operationIds, summaries, and tags.
     - All 187 internal `$ref` pointers resolve cleanly.
     - Ephemeral Express server mounts `/api/docs` and returns HTTP 200 with rendered Swagger UI.

### Job 4: `docker-build` (Production Docker Image Build)
- **Runner**: `ubuntu-latest`
- **Dependency**: Runs after `[backend-test, frontend-build, api-docs-validation]` complete successfully.
- **Steps**:
  1. `docker/setup-buildx-action@v3`: Initializes Docker Buildx.
  2. `docker build -t social-connect-server:ci -f server/Dockerfile server/`: Verifies the production multi-stage Dockerfile compiles without errors.

---

## 4. Environment Isolation & Secrets Policy

> [!IMPORTANT]
> The CI workflow is **100% isolated from production**. It does not connect to any live production infrastructure or external network services.

- **MongoDB**: Ephemeral MongoDB 7.0 service container running inside the GitHub Actions virtual network.
- **Email Service**: Set to `EMAIL_PROVIDER=mock`. Emails are captured in an in-memory test inspection queue with zero SMTP network traffic.
- **Cloudinary**: Mocked with dummy test identifiers (`ci_mock_cloud`, `123456789012345`). Binary uploads are intercepted by mock handlers in tests.
- **JWT Secrets**: High-entropy dummy test secrets are injected directly via workflow environment variables.
- **Fork Safety**: Pull requests from public forks execute safely without requiring access to repository secrets.

---

## 5. Local Reproduction Guide

Every check performed in CI can be reproduced locally by developers before opening a pull request:

```bash
# ─── 1. Backend Tests & Coverage ───
cd server
npm ci
npm run test:coverage

# ─── 2. OpenAPI Documentation Validation ───
cd server
npm run validate:docs

# ─── 3. Dependency Security Audits ───
cd server && npm audit --omit=dev --audit-level=high
cd ../client && npm audit --omit=dev --audit-level=high

# ─── 4. Frontend Lint & Build ───
cd client
npm ci
npm run lint
npm run build

# ─── 5. Docker Container Build ───
# (Requires Docker installed locally)
cd server
docker build -t social-connect-server:local -f Dockerfile .
```

---

## 6. Failure Troubleshooting Guide

| Failure Scenario | Typical Cause | Resolution |
|---|---|---|
| **`npm ci` fails** | Lockfile mismatch with `package.json`. | Run `npm install` locally to update lockfile and commit `package-lock.json`. |
| **`backend-test` times out** | MongoDB service container not ready. | Verify MongoDB service options in `ci.yml` and check `connectDB` retries. |
| **`api-docs-validation` fails** | Added/modified endpoint without updating `docs/openapi.yaml`. | Update `docs/openapi.yaml` with the new route, operationId, and schema `$ref`. |
| **`frontend-build` fails** | Unused imports or JSX syntax error. | Run `npm run lint` and `npm run build` in `client/` to inspect compiler errors. |
| **`docker-build` fails** | Added runtime file not copied or ignored by `.dockerignore`. | Verify `server/.dockerignore` and `server/Dockerfile` `COPY` instructions. |
