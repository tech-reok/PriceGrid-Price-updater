# Price Catalog Access and Asynchronous Exports Plan

## Objective

Provide a tenant-scoped, read-only price catalog for company-defined users. A
catalog user may access one or more price lists explicitly assigned by the
company. For each authorized list, the user can search the current product
prices, see the currently applicable discount, and request an export in CSV,
JSON, or TXT format.

Exports must be asynchronous. A request is queued, processed by a worker, and
made available for download only after it is complete.

## Scope and Non-Goals

In scope:

- Per-user access to one or more price lists within the user's company.
- A catalog screen that displays product, SKU, base price, applied discount,
  discount amount, and final price.
- Current discount calculation using the existing pricing engine.
- CSV, JSON, and TXT export requests, status tracking, and downloads.
- A database-backed queue and a standalone worker process.
- Company-admin UI for assigning price lists to users.

Out of scope for this feature:

- Editing products, prices, discounts, or price lists from the catalog.
- API-key access to the catalog.
- Email notifications when an export is ready.
- Scheduled exports, webhooks, sharing downloads between users, or public links.
- Marketplace synchronization or third-party storage implementation beyond the
  storage abstraction described below.

## Important Domain Decision: Marketplace

The current `Price` model is unique by tenant, product, price list,
marketplace, and start date. A price list can therefore contain different
prices for different marketplaces. The catalog cannot return one unambiguous
price for a product without selecting a marketplace.

Phase-1 decision:

- The catalog requires an authorized price list and a marketplace selector.
- The marketplace selector contains only marketplaces associated with the
  selected price list.
- An export records the selected price list and marketplace as immutable input.

Future option:

- Add a `default_marketplace_id` to `price_lists` if the product wants a
  one-click default catalog view.

## Current Foundation

The project already provides useful building blocks:

- Tenant resolution protects administrative requests and binds normal users to
  the tenant in their JWT.
- System roles, company roles, and permission checks are already available.
- Products, price lists, marketplaces, prices, and discounts are tenant scoped.
- Price and price-history relations already use tenant-safe composite foreign
  keys. Price-list relation tables also include tenant-safe constraints after
  the multi-tenant hardening migration.
- `calculateFinalPrice` already applies exactly one active discount using this
  precedence: product, price list, marketplace, then base price.
- Angular already has route permission guards, tenant guards, session state,
  the shell navigation, reusable tables, loading/error panels, and toast
  feedback.

The project currently has no per-user price-list access table, catalog query
service, export queue, worker process, or file-storage abstraction.

## Authorization Model

Do not enforce catalog access by checking a role slug. Enforce it through
permissions and a per-user list assignment.

### New permissions

Add the following entries to the permission catalog:

| Permission | Meaning |
| --- | --- |
| `price-catalog:read` | Read the catalog for price lists assigned to the current user. |
| `price-catalog:read-all` | Read every price list in the current company. Intended for company/global administrators. |
| `price-catalog:export` | Queue and download exports for price lists the user can read. |
| `price-list-access:read` | View a user's assigned price lists. |
| `price-list-access:manage` | Replace a user's assigned price lists. |

### New system role

Seed a `price_catalog_viewer` system role with only:

- `price-catalog:read`
- `price-catalog:export`

This role does not receive `products:read`, `prices:read`, `discounts:read`,
`price-lists:read`, dashboard access, or administrative permissions. Its only
functional application surface is the catalog and its own export requests.

### Access rules

1. Global administrators and company administrators receive
   `price-catalog:read-all` through their existing broad permission sets.
2. A user with `price-catalog:read` receives only price lists in the access
   table.
3. A user with neither catalog read permission receives `403`.
4. A request for a list outside the current tenant returns `404`; a list in the
   tenant but not assigned to the user returns `403` or an intentionally
   indistinguishable `404`. Use one convention consistently and avoid leaking
   list names.
5. A download request rechecks tenant, ownership, read permission, and current
   list authorization. Revoking access must immediately stop new reads and
   downloads.

## Data Model and Migration

### `user_price_list_access`

Create an explicit tenant-aware join model:

| Column | Notes |
| --- | --- |
| `tenant_id` | Required tenant ownership. |
| `user_id` | Required assigned user. |
| `price_list_id` | Required authorized price list. |
| `created_at` | Assignment timestamp. |
| `created_by`, `created_by_type` | Audit source. |

Constraints:

- Primary key: `(tenant_id, user_id, price_list_id)`.
- `(tenant_id, user_id)` references the user inside the same company.
- `(tenant_id, price_list_id)` references the price list inside the same
  company.
- Add lookup indexes for `(tenant_id, user_id)` and
  `(tenant_id, price_list_id)`.

The current `User` model only has a single-column tenant relation. Before
adding the composite user relation, add `@@unique([tenantId, id])` to `User`.
This enables the database to enforce that a user assignment cannot point to a
different company.

### `export_requests`

Create a durable job record rather than storing generated files in the request
process. Suggested fields:

| Column | Notes |
| --- | --- |
| `id`, `tenant_id`, `requested_by_user_id` | Job identity and ownership. |
| `price_list_id`, `marketplace_id` | Immutable catalog selection. |
| `format` | Enum: `csv`, `json`, `txt`. |
| `filters` | JSON snapshot of supported query filters. |
| `status` | Enum: `queued`, `processing`, `completed`, `failed`, `expired`. |
| `attempt_count`, `max_attempts` | Retry control. |
| `locked_at`, `locked_by` | Worker claim / recovery data. |
| `started_at`, `completed_at`, `expires_at` | Lifecycle timestamps. |
| `storage_key`, `file_name`, `content_type`, `byte_size`, `checksum` | Generated artifact metadata. |
| `error_code`, `error_message` | Safe failure information. |
| audit columns | Creation and update attribution. |

Constraints and indexes:

- Tenant-safe composite foreign keys to User, PriceList, and Marketplace.
- Index `(status, created_at)` for job pickup.
- Index `(tenant_id, requested_by_user_id, created_at)` for the user's history.
- Index `(expires_at)` for artifact cleanup.

The worker must store an input snapshot, not a serialized result set. The
catalog is queried when the job is processed; the file records a `generatedAt`
timestamp so consumers know when its values were calculated.

## Testing Strategy and Required Coverage

Tests are mandatory for this feature. The feature must not be accepted based
only on manual UI verification because authorization, tenant isolation, and
asynchronous job recovery are security-sensitive behavior.

### Backend unit tests

Add focused tests for:

- Replacing a user's assigned price lists with one, many, and zero lists.
- Rejecting a user, price list, or marketplace from another tenant.
- Rejecting global users from tenant price-list assignments.
- Returning only assigned lists for `price-catalog:read` users.
- Returning every tenant list for users with `price-catalog:read-all`.
- Rejecting catalog queries without the required permission or without list
  assignment.
- Rejecting a marketplace that is not associated with the selected list.
- Selecting the current effective price deterministically by validity window.
- Showing the same applied discount and final price as `calculateFinalPrice`.
- Handling product-, price-list-, and marketplace-scoped discounts, including
  inactive, future, expired, and competing discounts.
- Validating each export request format and input selection.
- Ensuring export ownership and current list authorization at download time.
- Correct CSV escaping and formula-injection protection, JSON structure, and
  TXT delimiter/encoding behavior.
- Queue claim, stale-lock recovery, retry limit, terminal failure, expiration,
  and artifact cleanup behavior.

### API and integration tests

Use the Express application test pattern to verify:

- JWT tenant resolution remains authoritative for a regular catalog user.
- A global administrator still requires an active `X-Tenant-Id` context.
- Tenant A cannot assign, query, export, inspect, or download Tenant B data.
- A user can query each of several assigned lists but no unassigned list.
- Revoking an assignment blocks the next catalog call and download attempt.
- The export endpoint returns `202` with a queued job and never returns file
  content synchronously.
- Completed files stream with the expected content type and attachment name.
- Failed and expired jobs cannot be downloaded.

### Frontend tests

Add Angular tests for:

- Catalog route visibility and access with the new permission guards.
- A catalog-only user seeing no administrative navigation items.
- Price-list options limited to the mocked authorized lists.
- Marketplace options resetting when the selected list changes.
- Search, pagination, applied-discount rendering, and empty/error states.
- Export request creation, polling/refresh behavior, failure feedback, and
  download availability only for completed jobs.
- The Users module access-assignment action, save payload, permission gating,
  and reset on tenant switch.

### Verification gates

Before opening the implementation pull request:

1. Run backend unit/API tests, TypeScript build, Prisma validation, Prisma
   client generation, and migration deployment against a development database.
2. Run frontend unit tests and production build.
3. Perform a manual two-company smoke test with a catalog-only user and a
   company administrator.
4. Record exact commands and results in
   `agent/PRICE_CATALOG_ACCESS_AND_EXPORTS_IMPLEMENTATION.md`.

## Backend Design

### Access service

Introduce a focused `PriceListAccessService` instead of adding access behavior
to generic CRUD services.

Responsibilities:

- Verify that the target user belongs to the resolved tenant and is not a
  global user.
- Verify that every requested price-list ID belongs to the resolved tenant.
- Replace assignments atomically with `PUT` semantics.
- Read a user's assignments for administrative management.
- Resolve the catalog-visible list IDs for the authenticated user.
- Treat `price-catalog:read-all` as a tenant-wide list grant.

Suggested administrative API:

```text
GET /api/v1/users/:userId/price-list-access
PUT /api/v1/users/:userId/price-list-access
{ "priceListIds": ["..."] }
```

Require `price-list-access:read` and `price-list-access:manage` respectively.
The route must use the same JWT, tenant-resolution, permission, and strict Zod
validation patterns as the current administrative API.

### Catalog service

Introduce `PriceCatalogService` as a read model, separate from the mutable
`PriceService`.

Suggested user-facing API:

```text
GET /api/v1/price-catalog/price-lists
GET /api/v1/price-catalog/marketplaces?priceListId=:id
GET /api/v1/price-catalog?priceListId=:id&marketplaceId=:id&search=&page=&limit=
```

Catalog query behavior:

1. Resolve the request tenant and authenticated user.
2. Confirm the selected list is visible to the user.
3. Confirm the selected marketplace belongs to the list and tenant.
4. Fetch active, current prices for the selected list and marketplace, joined
   with tenant-owned products.
5. Fetch active discounts once for the tenant.
6. Fetch currency decimal metadata once per code.
7. Run `calculateFinalPrice` for every returned price with one shared `now`
   timestamp.
8. Return product data, selected list/marketplace data, base price, discount
   metadata, discount amount, final price, currency, and `calculatedAt`.

The catalog must use a deterministic rule for price validity:

- `status = active`
- `startDate <= now`
- `endDate IS NULL OR endDate >= now`
- `deletedAt IS NULL`

If multiple historical price rows are valid because of legacy data, define and
test a stable tie-breaker, such as the latest `startDate`, then latest
`updatedAt`. The preferred long-term solution is validation that prevents
overlapping active price windows for the same tenant/product/list/marketplace.

### Export request service and worker

Introduce separate services with explicit responsibilities:

- `ExportRequestService`: validates authorization, creates jobs, lists a
  user's jobs, retrieves job status, and authorizes downloads.
- `ExportWorkerService`: claims jobs, runs the catalog query, serializes the
  result, writes an artifact, and finalizes or retries the job.
- `ExportStorage`: interface for storing, opening, and deleting artifacts.
- `CatalogExportSerializer`: format-specific CSV, JSON, and TXT serialization.

Suggested user-facing API:

```text
POST /api/v1/price-catalog/exports
GET  /api/v1/price-catalog/exports
GET  /api/v1/price-catalog/exports/:id
GET  /api/v1/price-catalog/exports/:id/download
```

`POST` accepts `priceListId`, `marketplaceId`, `format`, and supported filters.
It returns `202 Accepted` and the queued job metadata. Download is allowed only
for completed, unexpired jobs that the current user still has permission to
read.

### Queue implementation

The existing project has MySQL but no Redis, BullMQ, queue processor, or
background scheduler. Use a database-backed queue for the first version:

1. Add `npm run worker:exports` to start a dedicated worker process.
2. Poll for queued jobs at a configurable interval.
3. Claim one job inside a transaction using an atomic status transition and
   lock metadata. Use MySQL 8 locking semantics to make multiple worker
   processes safe.
4. Recover stale `processing` jobs whose lock has expired.
5. Retry transient failures up to `max_attempts`; record a safe error message
   for terminal failures.
6. Periodically mark expired jobs and remove artifacts through the storage
   adapter.

Do not run this worker inside the Express request process in production. Local
development may run it separately alongside the API.

### Storage and serialization

Implement a storage interface first:

```text
put(storageKey, streamOrBuffer) -> metadata
open(storageKey) -> readable stream
remove(storageKey) -> void
```

Initial adapter:

- Local filesystem under a configured non-public export directory for
  development.

Production adapter decision:

- Object storage (S3-compatible, Azure Blob, or equivalent) with credentials
  provided through environment variables. Do not store large file blobs in
  MySQL.

Output requirements:

- CSV: RFC-style quoting, UTF-8, formula-injection protection for cells that
  begin with `=`, `+`, `-`, or `@`.
- JSON: metadata envelope plus a `data` array.
- TXT: documented tab-separated UTF-8 rows.
- All formats contain the same columns and the calculation timestamp.

## Frontend Design

### Catalog user experience

Create a dedicated `PriceCatalogComponent` and route, rather than exposing the
existing administration pages to viewer users.

The screen should include:

- Price-list select, populated only with lists visible to the current user.
- Marketplace select, disabled until a price list is selected.
- Search input and stable pagination.
- Read-only results table with product, SKU, base price, applied discount,
  discount amount, final price, and currency.
- Export format menu with CSV, JSON, and TXT choices.
- Export request history with status, date, error state, and a download icon
  for completed files.

When a user only has catalog permissions, navigation must show the catalog and
hide administrative modules. Route guards remain the enforcement mechanism;
hiding navigation is only a usability measure.

### Company-admin assignment UX

Extend the Users module with a row action such as “Price-list access”. It
opens a modal with the company's active price lists and a multi-select or
checkbox list. Saving replaces the user's full set of assignments.

Behavior:

- The action is visible only with `price-list-access:manage`.
- Global users cannot receive tenant price-list assignments.
- Saving is disabled while list options load.
- On company context switch, close the modal or clear options before loading
  the newly selected tenant's data.

### Price-list marketplace assignment UX

The catalog marketplace selector is driven by the existing tenant-scoped
`price_list_marketplaces` relation. The Price Lists module must expose a
row action that lets an administrator with `price-lists:update` select the
active marketplaces for a list and save through the existing
`PUT /price-lists/:id/marketplaces` endpoint. The modal must preload the
current associations returned by the price-list detail endpoint.

## Files and Modules Expected to Change

Backend:

- `prisma/schema.prisma` and a new migration.
- `prisma/seed/data.ts`, base permission seed logic, and seed tests.
- New validators for access assignment, catalog filters, and export requests.
- New services, controllers, repositories/model options, DI tokens, and route
registration for access, catalog, exports, worker, storage, and serializers.
- `package.json`, environment validation, and a worker entry point.
- Unit tests plus route/application tests.

Frontend:

- Core models and services for catalog items, access assignments, and export
  request metadata.
- `app.routes.ts`, shell navigation, and permission tests.
- New catalog feature component and its tests.
- Users feature action/modal and its tests.
- Price Lists marketplace-assignment modal and its tests.

Documentation:

- `README.md` for the role, permissions, worker startup, storage environment
  variables, file retention, and download authorization behavior.
- `agent/PRICE_CATALOG_ACCESS_AND_EXPORTS_IMPLEMENTATION.md` as the
  implementation record for this feature. Create this English document after
  the feature is complete and keep it with the other AI working-memory files.
  It must describe the final data model and migrations, permissions and roles,
  API contracts, frontend modules, worker and storage operation, security
  rules, deployment/configuration changes, test evidence, and any intentional
  deviations from this plan.

## Implementation Order

1. Rebase this branch on the latest `main` before implementation. It must
   include the multi-tenant relation hardening migration.
2. Add schema enums, `User` composite uniqueness, access table, export table,
   indexes, and tenant-safe foreign keys.
3. Generate Prisma client, apply the migration in development, and add seed
   permissions/role data.
4. Implement and test `PriceListAccessService` and its administrative routes.
5. Implement and test `PriceCatalogService`, including authorization,
   marketplace filtering, price validity, and current discount calculation.
6. Implement catalog frontend route and read-only screen.
7. Implement export request persistence, validation, and user job endpoints.
8. Implement storage abstraction, serializers, and worker claiming/retry flow.
9. Implement export history/download frontend behavior.
10. Expose and test the existing price-list marketplace association workflow
   in the Price Lists module.
11. Add end-to-end tenant, role, access-revocation, and export lifecycle tests.
12. Update README and operational runbooks.
13. Create `agent/PRICE_CATALOG_ACCESS_AND_EXPORTS_IMPLEMENTATION.md` in
    English with the implemented-change record, operational notes, migration
    instructions, API/permission summary, and verification results.
14. Run full backend/frontend build and test suites, and record the final
    verification evidence in the implementation document.

## Acceptance Criteria

- A company can assign one or more of its own price lists to a catalog user.
- A catalog user cannot enumerate, query, export, or download another list.
- A catalog user cannot access product, price, discount, user, role, or company
  administration modules through the UI or API.
- Company and global administrators can view all catalog lists in their active
  tenant and can manage assignments when permitted.
- Every catalog row shows a current deterministic price and the one discount
  actually selected by the existing pricing engine.
- CSV, JSON, and TXT jobs are queued, recover safely from worker failure, and
  are downloadable only by their authorized requester while unexpired.
- Tenant A can never assign Tenant B's list, query Tenant B's data, or obtain
  Tenant B's export artifact.
- Full backend and frontend test suites pass, along with Prisma validation,
  client generation, migrations, and production build checks.
