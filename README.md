# PriceGrid — Price Management Admin Application

A multi-tenant administrative web application to **capture, edit and propagate product
prices** across multiple marketplaces (Amazon, Mercado Libre and an owned store).

Phase 1 delivers the architecture, database, authentication, multi-tenant isolation,
core CRUD, pricing/discount rules, price history, audit, seeds and unit tests.
**Real marketplace integration is intentionally out of scope** — the external API,
API keys and scopes are the foundation for it.

---

## Table of contents

- [Stack](#stack)
- [Branding](#branding)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Backend: install, configure and run](#backend-install-configure-and-run)
- [Database: migrations and seeds](#database-migrations-and-seeds)
- [Initial development credentials](#initial-development-credentials)
- [Frontend: install and run](#frontend-install-and-run)
- [Environment variables](#environment-variables)
- [Business rules: pricing and discounts](#business-rules-pricing-and-discounts)
- [Tenant time zones and business dates](#tenant-time-zones-and-business-dates)
- [Multi-tenancy and authentication](#multi-tenancy-and-authentication)
- [API reference](#api-reference)
- [Testing](#testing)
- [What is covered by the tests](#what-is-covered-by-the-tests)
- [Suggested integration / E2E tests (future)](#suggested-integration--e2e-tests-future)
- [Troubleshooting](#troubleshooting)
- [Roadmap / out of scope for phase 1](#roadmap--out-of-scope-for-phase-1)

---

## Stack

| Layer     | Technology |
|-----------|------------|
| Backend   | Node.js + **Express** + TypeScript, **Prisma** ORM, **MySQL 8**, **tsyringe** DI, **Zod** validation, **pino** JSON logging, **Jest** |
| Frontend  | **Angular 19** + **Tailwind CSS 3** + **spartan/ui brain** (`@spartan-ng/brain`) + **lucide** icons + **ngx-charts** + **Jasmine + Karma** |
| Database  | MySQL 8 — a **single shared database** with `tenant_id` isolation (composite tenant foreign keys on `prices` / `price_history`) |

> **Frontend dependency note.** `@spartan-ng/brain` is pinned to `0.0.1-alpha.400`, the
> last line that supports Angular 19 / Tailwind 3 (`>=18.0.0` / `>=3.3.0`). The `1.x`
> releases require Angular 21+ and Tailwind 4, which is why they are not used. Themed
> wrappers live in `src/app/shared/ui/` (the shadcn/spartan copy-in model); today the
> toggle is built on the real `BrnSwitch` primitive.

---

## Branding

PriceGrid uses a product-focused logo built around a price tag and internal grid nodes,
matching the system's purpose: price administration and marketplace catalog propagation.
The Angular implementation lives in
`src/frontend/prices-admin/src/app/shared/pricegrid-logo.component.ts` and is reused by
the login header and the authenticated sidebar.

Brand colors used by the logo:

| Token | Hex | Use |
|-------|-----|-----|
| Forest | `#314534` | Price tag body and `Price` text |
| Olive | `#66745C` | `Grid` text |
| Accent | `#7FA36B` | Internal grid lines |
| Surface | `#FAFBF6` | Tag nodes and hole |

---

## Repository layout

```
src/
  backend/prices-api/     # Express REST API (see its own README section below)
  frontend/prices-admin/  # Angular admin dashboard
IMPLEMENTATION_PLAN.md    # the phase-1 plan this codebase implements
README.md                 # this file
```

---

## Prerequisites

- **Node.js 20+** (developed on Node 24) and npm
- **MySQL 8** running locally (Laragon, XAMPP, Docker or a native install)
- An empty database (the example uses `pricesgrid`)

---

## Backend: install, configure and run

```bash
cd src/backend/prices-api

# 1) Install dependencies
npm install

# 2) Create the environment file
cp .env.example .env      # Windows: copy .env.example .env
#    -> edit DATABASE_URL and the JWT / API key secrets

# 3) Generate the Prisma client
npm run prisma:generate

# 4) Apply the schema (migrations own the STRUCTURE only)
npm run migrate:dev       # development (creates + applies)
# npm run migrate:deploy  # CI / staging / production

# 5) Insert the initial data (idempotent)
npm run seed

# 6) Start the API
npm run dev               # http://localhost:3000
```

Verify the API is up:

```bash
curl http://localhost:3000/health
# { "status": "ok", "db": "up", "uptime": 3, "version": "1.0.0", "timestamp": "..." }
```

`GET /health` (also `GET /api/v1/health`) validates both the process and the database
connection with a `SELECT 1` probe.

### Creating the MySQL database

```sql
CREATE DATABASE pricesgrid CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

If MySQL is not reachable, `npm run migrate:dev` and `npm run seed` will fail — start
MySQL first. The unit tests do **not** need a database (Prisma is mocked).

> **Verified against MySQL 8.0.30.** The migration and seed flow was exercised end to end
> on a real server: `prisma migrate deploy` created the schema (including the composite
> tenant foreign keys), `npm run seed` loaded 2 currencies / 46 permissions / 4 roles /
> 1 company / 2 users / 3 marketplaces / 3 price lists / 3 products / 27 prices with 27
> history rows / 1 discount, a **second run produced identical row counts** (idempotency),
> and the running API answered login, price calculation, cross-tenant rejection, strict
> payload rejection and the external API correctly.

> **Note on `migration.sql` encoding.** The file must stay BOM-free: MySQL rejects a UTF-8
> BOM at the start of the script (`ER_PARSE_ERROR` around `-- CreateTable`). If you
> regenerate it with PowerShell, write it without a BOM
> (`[System.IO.File]::WriteAllText($path, $sql, (New-Object System.Text.UTF8Encoding $false))`).

---

## Database: migrations and seeds

The project separates **structure** from **initial data**:

| Concern | Tool | Responsibility |
|---------|------|----------------|
| Structure | `prisma migrate` | Create/modify tables, columns, indexes and constraints |
| Initial data | `prisma/seed` | Insert currencies, permissions, roles, demo data |

Business data is never placed inside migrations.

```bash
npm run migrate:dev        # prisma migrate dev
npm run migrate:deploy     # prisma migrate deploy
npm run seed               # prisma db seed
npm run seed:demo-api-key  # optional: on-demand development API key
```

### Base seeds vs demo seeds

| Group | Contents | When it runs |
|-------|----------|--------------|
| **Base** | currencies (MXN, USD), the full permission catalog, the four system roles | **always** |
| **Demo** | demo company, demo users, marketplaces, price lists, products, relations, prices (+history) and a demo discount | only in development |

Demo seeds are **protected**: they run only when `NODE_ENV=development` **or**
`ALLOW_DEMO_SEED=true`. In staging/production with `ALLOW_DEMO_SEED` unset, `npm run seed`
loads base data only — demo data can never appear by accident.

```
# production-safe
NODE_ENV=production npm run seed     # base only
```

### What the seeds create

**Base**

- **Currencies**: `MXN` (Peso mexicano, `$`, 2 decimals) and `USD` (Dólar estadounidense, `$`, 2 decimals)
- **Permissions**: 46 permissions across 14 modules using the `module:action` convention
  (`products:read`, `prices:calculate`, `api-keys:revoke`, `roles:assign-permissions`, `tenants:switch`, …)
- **System roles** (`is_system = true`, `tenant_id = null`):
  - `global_admin` — every permission, including company management and switching
  - `tenant_admin` — everything inside its company, **except** global company management
  - `tenant_user` — operational read/write on the main catalog modules
  - `readonly_user` — read-only across the price catalog

**Demo** (development only)

- **Company**: `Demo Company` / `Demo Company S.A. de C.V.` (slug `demo-company`, currency `MXN`)
- **Users**: a global administrator (`tenant_id = null`) and a company administrator
- **Marketplaces**: Amazon, Mercado Libre, Tienda propia
- **Price lists**: Retail, Wholesale, Marketplace (MXN)
- **Products**: `SKU-DEMO-001`, `SKU-DEMO-002`, `SKU-DEMO-003`
- **Relations**: every product linked to every price list, every price list to every marketplace
- **Prices**: one price per product × list × marketplace (27), each with an initial
  `price_history` row (`reason = create`, actor `system`)
- **Discount**: `Descuento demo 10%` (percentage, product-scoped, active) — reflected in the
  seeded `final_price` values

All seeds are **idempotent**: they use upserts/find-or-create keyed on unique fields, so
running `npm run seed` repeatedly never duplicates data.

### Demo API key (separate command)

`npm run seed` never creates API keys. Generate one explicitly:

```bash
npm run seed:demo-api-key
```

The plaintext key is printed **once** to the console; only its hash is stored. It is bound
to the demo company with the read-only phase-1 scopes
(`products:read`, `prices:read`, `price-lists:read`, `marketplaces:read`) and can be used
against the external API:

```bash
curl -H "X-API-Key: <the key>" http://localhost:3000/api/v1/external/products
```

Never hardcode real API keys in versioned files.

---

## Initial development credentials

Created by the demo seeds from `.env` (see `.env.example`):

| User | Email variable | Password variable | Role |
|------|----------------|-------------------|------|
| Global administrator | `SEED_GLOBAL_ADMIN_EMAIL` | `SEED_GLOBAL_ADMIN_PASSWORD` | `global_admin` |
| Company administrator | `SEED_TENANT_ADMIN_EMAIL` | `SEED_TENANT_ADMIN_PASSWORD` | `tenant_admin` |

Local defaults (from `.env.example`):

```
global.admin@pricesgrid.local / ChangeMe!123
tenant.admin@pricesgrid.local / ChangeMe!123
```

> ⚠️ **Change these credentials in every non-local environment.** They are development
> conveniences only. Passwords are always stored hashed (bcrypt).

---

## Frontend: install and run

```bash
cd src/frontend/prices-admin

npm install
npm start          # http://localhost:4200
```

The dev server proxies to the API at `http://localhost:3000` (configured through the
Angular environment file). Start the backend first so login works.

---

## Environment variables

Backend (`src/backend/prices-api/.env`):

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | Environment (`development` enables demo seeds) | `development` |
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | MySQL connection string | `mysql://root@127.0.0.1:3306/pricesgrid` |
| `JWT_ACCESS_SECRET` | Access-token signing secret | — |
| `JWT_REFRESH_SECRET` | Refresh-token hashing secret | — |
| `JWT_ACCESS_TTL` | Access-token lifetime | `15m` |
| `JWT_REFRESH_TTL_DAYS` | Refresh-token lifetime in days | `7` |
| `API_KEY_HASH_SECRET` | HMAC secret used to hash API keys | — |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated | `http://localhost:4200` |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` | `info` |
| `ALLOW_DEMO_SEED` | Explicit opt-in for demo seeds | `true` in dev |
| `SEED_GLOBAL_ADMIN_EMAIL` / `SEED_GLOBAL_ADMIN_PASSWORD` | Initial global admin | see `.env.example` |
| `SEED_TENANT_ADMIN_EMAIL` / `SEED_TENANT_ADMIN_PASSWORD` | Initial company admin | see `.env.example` |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | Refresh-cookie attributes | `lax` / auto in production |

---

## Business rules: pricing and discounts

**Phase 1 applies exactly ONE discount — discounts never stack or accumulate.**

Precedence, highest first:

1. **Product**-scoped discount
2. **Price list**-scoped discount
3. **Marketplace**-scoped discount
4. **Base price** (no discount)

Within the same level the winner is chosen by `priority ASC`, then `created_at ASC`,
then `id` — fully deterministic.

```
fixed:      final = base_price - value
percentage: final = base_price * (1 - value / 100)
final = max(final, 0)                       # configurable floor
final = round(final, currency.decimals)     # currency-aware rounding
```

### Tenant time zones and validity dates

Validity dates are business-calendar dates, not UTC instants. The API accepts
`YYYY-MM-DD` for price and discount validity fields and stores them in MySQL
`DATE` columns. For a tenant configured as `America/Mexico_City`, a discount
with `startDate = endDate = 2026-09-19` remains active for that company's full
local day and expires at its next local midnight. This rule is shared by the
admin preview, catalog, dashboard and export worker.

Every change to a price's base or final value writes an **append-only** `price_history`
row in the same transaction, recording old/new values, the reason and the actor
(`user` or `api_key`).

### Currencies (phase 1)

- Currencies are **read-only**: `GET /currencies` and `GET /currencies/:code`.
- The system stores `currency_code`, validates it against the `currencies` catalog and uses
  its `decimals` for rounding.
- **No automatic currency conversion or exchange rates** — that is a future phase.

---

## Multi-tenancy and authentication

A single shared MySQL database with `tenant_id` on every business table and relation
table. Repositories
**always** filter by the resolved tenant, so isolation is enforced at the data layer.
Cross-tenant ids return **404** (not 403) to avoid leaking existence.

**Tenant resolution order**

1. **API key** (`X-API-Key`) → tenant bound to the key (external API)
2. **Global admin** → `X-Tenant-Id` header (the company selected in the UI)
3. **Non-global user** → tenant from the JWT only

`X-Tenant-Id` is accepted **only** from a `global_admin`. A non-global user sending it
receives `403 TENANT_HEADER_NOT_ALLOWED`.

**Dashboard sessions**

- Access token (JWT, ~15 min) returned in the response body and kept in frontend memory.
- Refresh token in an **`HttpOnly` `Secure` cookie** scoped to `/api/v1/auth`; only its
  hash is stored. It is rotated on every refresh and reused tokens invalidate the family.
- CORS must allow credentials (already configured via `CORS_ORIGIN`).
- Never store the refresh token in `localStorage`.

**API keys (external API)**

- Read-only scopes in phase 1: `products:read`, `prices:read`, `price-lists:read`,
  `marketplaces:read`. Write scopes are a future phase.
- Only the HMAC hash is persisted; the plaintext key is shown once at creation.
- Effective status is **derived**: `revoked` is persisted (`revoked_at`), `expired` is
  computed from `expires_at`. Revoked and expired keys are rejected.
- `last_used_at` is updated on every successful use.

**Cross-tenant reference protection (three layers)**

Referencing another tenant's records is blocked at every level, not only when listing:

1. **Composite foreign keys (database).** `prices` references `products`, `price_lists` and
   `marketplaces` through `(tenant_id, <ref_id>) → (tenant_id, id)`, `price_history`
   does the same for `prices` and `products`, and price-list relation tables use the same
   tenant-safe keys. The database itself refuses a cross-tenant reference.
2. **Service validation (application).** `PriceService` verifies the product, price list and
   marketplace belong to the resolved tenant before calculating or persisting, and
   `DiscountService` does the same for its scope reference. This is required because a
   discount's two unused scope columns are necessarily `NULL`, which makes a composite
   tenant foreign key impractical in the current model; `DiscountService` therefore
   normalizes scope columns and validates the active reference.
3. **Repository scoping.** Every read is filtered by `tenant_id`, so an unknown
   cross-tenant id resolves to *not found* (422 on validation, 404 on resource lookups).

**Strict payload validation**

Every request-body schema is Zod `.strict()`: unknown fields are **rejected with 422**
rather than silently stripped, so a client cannot smuggle columns the API does not accept
(`id`, `tenantId`, `createdBy`, `finalPrice`, …). `tenantId` is never accepted from a
client — it always comes from the resolved request context. Query strings stay permissive
so list filters keep working.

**Audit trail**

Every write stamps `created_by` / `created_by_type` and `updated_by` / `updated_by_type`
(`user`, `api_key` or `system`), including the services that use Prisma directly
(role creation, price creation and price history).

**Price catalog access and exports**

- The `price_catalog_viewer` role can read and export only the price lists
  explicitly assigned to its user.
- Company administrators manage assignments from the Users module; assignments
  are stored with tenant-safe composite foreign keys.
- Company administrators also assign active marketplaces to each price list
  from the Price Lists module; only those list-marketplace combinations are
  available in the catalog selector.
- The read-only catalog requires both a price list and a marketplace because a
  single product can have different prices per marketplace.
- Catalog results calculate the current applicable discount through the pricing
  engine instead of trusting a previously stored final price.
- CSV, JSON, and TXT exports are persisted as queued jobs and processed by the
  separate worker: `npm run worker:exports`.
- Development artifacts use `EXPORT_DIRECTORY`; production should provide an
  object-storage implementation through the export storage adapter. Jobs expire
  after `EXPORT_RETENTION_HOURS` (24 hours by default).

**Tenant time zones and business dates**

- Each company stores an IANA time-zone identifier in `tenants.time_zone`; new
  companies default to `UTC` and demo data uses `America/Mexico_City`.
- Company administrators can change the selected zone from **Settings** when
  their role has `settings:update`. The frontend shows the current local
  business time and searchable IANA zones with their current UTC offset.
- `GET /api/v1/tenants/me/time-zone` reads the selected company zone and
  `PATCH /api/v1/tenants/me/time-zone` updates it using the resolved tenant
  context. A tenant id is never accepted for this operation.
- Price and discount `startDate` / `endDate` values are calendar dates stored
  as MySQL `DATE`, submitted as `YYYY-MM-DD`, and evaluated inclusively in the
  company's zone. A same-day discount applies from local `00:00:00` through
  local `23:59:59.999`.
- Pricing, catalog, preview, dashboard expiration windows and queued exports
  share the same business-date calculation. The backend uses the Node.js ICU
  `Intl` time-zone database, so no fixed-offset arithmetic is used.

---

## API reference

Base path `/api/v1`. List endpoints accept
`?page=&limit=&search=&status=&sort=&order=` and return
`{ data, meta: { page, limit, total, totalPages } }`.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Email + password → access token + refresh cookie |
| POST | `/auth/refresh` | Rotate the refresh cookie, issue a new access token |
| POST | `/auth/logout` | Clear the cookie and revoke the refresh token |
| GET | `/auth/me` | Current user + role + permissions + company |

### Administrative API (JWT + tenant + permissions)

| Resource | Endpoints |
|----------|-----------|
| Companies | `GET/POST /tenants`, `GET/PATCH/DELETE /tenants/:id`, `GET /tenants/me`, `GET/PATCH /tenants/me/time-zone` |
| Users | `GET/POST /users`, `GET/PATCH/DELETE /users/:id` |
| Roles | `GET/POST /roles`, `GET/PATCH/DELETE /roles/:id`, `GET/PUT /roles/:id/permissions` |
| Permissions | `GET /permissions`, `GET /permissions/:id` *(read-only)* |
| Currencies | `GET /currencies`, `GET /currencies/:code` *(read-only)* |
| Products | `GET/POST /products`, `GET/PATCH/DELETE /products/:id` |
| Marketplaces | `GET/POST /marketplaces`, `GET/PATCH/DELETE /marketplaces/:id` |
| Price lists | `GET/POST /price-lists`, `GET/PATCH/DELETE /price-lists/:id`, `PUT /price-lists/:id/products`, `PUT /price-lists/:id/marketplaces` |
| Prices | `GET/POST /prices`, `GET/PATCH/DELETE /prices/:id`, `POST /prices/calculate`, `POST /prices/:id/calculate`, `GET /prices/:id/history` |
| Price history | `GET /price-history`, `GET /price-history/:id` *(append-only)* |
| Discounts | `GET/POST /discounts`, `GET/PATCH/DELETE /discounts/:id` |
| API keys | `GET/POST /api-keys`, `GET/PATCH/DELETE /api-keys/:id`, `POST /api-keys/:id/revoke` |
| Dashboard | `GET /dashboard/summary`, `GET /dashboard/recent-prices`, `GET /dashboard/prices-by-marketplace` |
| Health | `GET /health` |

### External read-only API (`X-API-Key`)

Tenant is resolved from the key; each route enforces its scope.

| Method | Path | Scope |
|--------|------|-------|
| GET | `/external/products`, `/external/products/:id` | `products:read` |
| GET | `/external/price-lists`, `/external/price-lists/:id` | `price-lists:read` |
| GET | `/external/prices`, `/external/prices/:id` | `prices:read` |
| GET | `/external/marketplaces`, `/external/marketplaces/:id` | `marketplaces:read` |

### Error envelope

Every error uses one shape:

```json
{
  "statusCode": 422,
  "code": "VALIDATION_ERROR",
  "message": "Invalid input",
  "details": [{ "field": "value", "message": "must be >= 0" }],
  "traceId": "req_abc123",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## Testing

### Backend — Jest (coverage threshold **70% global**)

```bash
cd src/backend/prices-api

npm test              # run the unit tests once
npm run test:watch    # watch mode
npm run test:cov      # run + generate the coverage report
```

The coverage report is written to `src/backend/prices-api/coverage/`:

- `coverage/lcov-report/index.html` — browsable HTML report
- `coverage/lcov.info` — LCOV for CI integrations
- console summary (`text` + `text-summary`)

The threshold is enforced in `jest.config.ts` (`coverageThreshold.global`), so
`npm run test:cov` fails if coverage drops below 70% for lines, statements, functions or
branches.

Current status: **313 tests passing — 96.6% lines / 81.9% branches / 98.8% functions**
(96.3% statements).

The unit tests never touch a real database: repositories, services and seeds run against
an in-memory Prisma double (`tests/helpers/fake-prisma.ts`).

### Frontend — Jasmine + Karma (coverage threshold **60% global**)

```bash
cd src/frontend/prices-admin

npm test                       # run the unit tests once (ChromeHeadlessCI)
npm run test:watch             # watch mode
npm run test:coverage          # run + generate the coverage report
```

The coverage report is written to
`src/frontend/prices-admin/coverage/prices-admin/` (`index.html` for the browsable report,
`lcov.info` for CI).

Thresholds are enforced in `karma.conf.js` (`coverageReporter.check.global`), so the run
fails if coverage drops below 60% for lines, statements, functions or branches.

Current status: **172 tests passing — 95.8% lines / 81.4% branches / 93.1% functions**
(94.4% statements).

Tests run through the `ChromeHeadlessCI` launcher (defined in `karma.conf.js`), which adds
`--no-sandbox --disable-gpu --disable-dev-shm-usage` so the suite works in containers and
CI without a GPU. `npm test` and `npm run test:coverage` already select that browser.

### Reproducible build

`src/index.html` deliberately does **not** reference a remote webfont. Angular's production
build inlines fonts referenced from `index.html`, so an external Google Fonts link makes
`ng build` fail on a machine without internet access. The UI uses a system font stack
defined in `tailwind.config.js`; to use Inter, self-host the `.woff2` files and declare
`@font-face` in `src/styles.css`.

Feature screens are lazily loaded, which keeps the heavy charting dependency out of the
initial bundle: `ng build` produces a ~361 kB initial bundle with the dashboard
(ngx-charts) in its own lazy chunk.

---

## What is covered by the tests

### Backend

| Area | Covered behaviour |
|------|-------------------|
| Pricing engine | base-only, fixed, percentage, floor/clamp, currency-aware rounding, scope precedence, `priority`/`created_at`/`id` tie-breaks, expired/inactive/future discounts ignored |
| Discount priority | exactly one discount applied — product → price list → marketplace → base (no accumulation) |
| JWT auth | login success/failure, token issuance and claims, refresh rotation, reuse detection, logout revocation, cookie attributes |
| API keys | generation, hashing (hash-only storage), derived `active`/`revoked`/`expired` status, `last_used_at`, scope loading |
| Scope validation | allow/deny per scope |
| Tenant resolution | JWT / `X-Tenant-Id` / API-key paths; `X-Tenant-Id` rejected for non-global users |
| Multi-tenant isolation | repository-level filtering, cross-tenant reads/writes → 404 |
| Cross-tenant references | `PriceService` (create + `POST /prices/calculate`) and `DiscountService` (create/update) reject product, price-list and marketplace ids owned by another tenant, reporting the offending field and persisting nothing |
| Roles | system + tenant role resolution, permission assignment, system-role protections |
| Final price + history | create/update history rows with the correct actor and reason; no row when nothing changed |
| Audit | `created_by`/`updated_by` (+ `*_by_type`) for users, API keys, roles and prices |
| Strict payloads | unknown/extra fields rejected with 422; a client-supplied `tenantId` is refused |
| Soft delete | `deleted_at` stamping and exclusion from listings |
| Currencies | validation, read-only access, no conversion |
| Seeds | content, idempotency (double-run), demo-seed policy gate, hashed passwords, history rows |
| External API | tenant-from-key, scope enforcement, read-only routing |
| App wiring | health check (up/down), 404 envelope, correlation id, malformed JSON, login → refresh → logout flow |

### Frontend

| Area | Covered behaviour |
|------|-------------------|
| Services | every API-consuming service with mocked HTTP (`AuthService`, `ProductsService`, `PricesService`, `ApiKeysService`, `CurrenciesService`, …) |
| JWT interceptor | attaches the bearer token and `X-Tenant-Id`, single-flight refresh on 401, logout on refresh failure |
| Route guards | `authGuard`, `roleGuard`, `tenantGuard` allow/redirect logic |
| Session & logout | access token in memory, current-user loading, logout clears state and redirects |
| Screens | Login, Dashboard, Companies, Products, Price Lists, Marketplaces, Prices, Price History, Discounts, API Keys, Users, Roles |
| Visual states | loading, empty, error and success rendering |
| Forms | required fields, ranges, enums, conditional discount scope fields, price preview, strict-payload-safe mappers (references dropped on price update, empty password omitted, blank currency sent as `null`) |
| Toggle | `SwitchComponent` built on spartan/ui `BrnSwitch`, including its ControlValueAccessor behaviour |
| Pipes | status/currency/date formatting |

---

## Suggested integration / E2E tests (future)

Deliberately out of scope for phase 1, recommended next:

1. **API ↔ database integration** against a disposable MySQL database (migrations + seeds +
   real Prisma), verifying constraints, transactions and the price-history append.
2. **End-to-end journeys** (Playwright/Cypress): login → create product → create price →
   verify calculated final price → logout, for both the global admin and a company admin.
3. **Cross-tenant E2E isolation**: authenticate as tenant A and assert every read/write of
   tenant B's ids returns 404.
4. **External API consumer flows**: full scope matrix and expired/revoked key behaviour
   against a running instance.
5. **Marketplace provider adapters** once integration lands (contract tests per provider).
6. **CI quality gates**: run `npm run test:cov` and `npm run test:coverage` as required
   checks and publish the LCOV reports.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `P1001: Can't reach database server` | Start MySQL and verify `DATABASE_URL` (host, port, user, password, database). |
| `Unknown database 'pricesgrid'` | `CREATE DATABASE pricesgrid;` then re-run `npm run migrate:dev`. |
| `@prisma/client did not initialize yet` | Run `npm run prisma:generate`. |
| Login fails after seeding | Re-run `npm run seed` and confirm `ALLOW_DEMO_SEED=true` (or `NODE_ENV=development`); the users only exist with demo seeds. |
| Frontend cannot reach the API (CORS) | Set `CORS_ORIGIN` to the exact Angular origin and restart the API. |
| Refresh cookie not sent | The cookie is `HttpOnly` + `SameSite=Lax` and scoped to `/api/v1/auth`; use a client that supports cookies and enable CORS credentials. |
| `npm run seed` loads no demo data | Demo seeds are gated — set `ALLOW_DEMO_SEED=true` or `NODE_ENV=development`. |

---

## Roadmap / out of scope for phase 1

- Stacking/accumulating discounts (multiple discounts, exclusive flags, chained percentages)
- API key **write** scopes and external create/update endpoints
- Real Amazon / Mercado Libre / owned-store integration via provider adapters
- Currency administration CRUD (phase 1 exposes currencies read-only)
- Automatic currency conversion and exchange rates
- End-to-end/integration suites and CI coverage gates

See `IMPLEMENTATION_PLAN.md` for the full phase-1 specification.
