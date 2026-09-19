# Multi-Tenant Company Scope Modification Plan

## Goal

Ensure each company owns and manages its own products, prices, price lists, marketplaces, discounts, API keys, users, and operational history. No tenant-scoped business data should behave as global data, leak across companies, or allow cross-company references through API flows, UI flows, or database constraints.

## Current Assessment

The project already has a strong multi-tenant foundation:

- `products`, `price_lists`, `prices`, `discounts`, `marketplaces`, `api_keys`, `users`, and `price_history` include `tenant_id`.
- Administrative routes resolve a tenant context before tenant-scoped CRUD operations.
- Non-global users operate only inside their JWT tenant.
- Global administrators operate inside the selected company via `X-Tenant-Id`.
- Generic repositories add `tenantId` filters for tenant-scoped resources.
- `prices` already use composite tenant-safe foreign keys for product, price list, and marketplace references.
- The frontend has a tenant guard and sends `X-Tenant-Id` only for global administrators.

However, several areas should be hardened so company ownership is enforced consistently at every layer.

## Modification Plan

### 1. Confirm Tenant Ownership Matrix

Create and maintain a clear ownership matrix for all entities:

| Entity | Scope | Notes |
| --- | --- | --- |
| Tenants / Companies | Global | Managed only by global administrators |
| Currencies | Global read-only | Shared catalog |
| Permissions | Global read-only | Shared catalog |
| System roles | Global | Shared role templates |
| Custom roles | Tenant | Owned by one company |
| Users | Tenant, except global admins | Normal users belong to one company |
| Products | Tenant | Company-specific |
| Marketplaces | Tenant | Company-specific marketplace configuration |
| Price lists | Tenant | Company-specific |
| Prices | Tenant | Company-specific and reference tenant-owned records |
| Price history | Tenant | Append-only company history |
| Discounts | Tenant | Company-specific and reference tenant-owned records |
| API keys | Tenant | Bound to one company |

Deliverable:

- Add or update documentation describing which entities are global and which are tenant-owned.
- Use this matrix as the acceptance checklist for backend, frontend, tests, and migrations.

### 2. Harden Discount Scope Validation

Problem:

`discounts` are tenant-scoped, and `DiscountService` validates referenced product, price list, or marketplace ownership. However, partial updates can still be risky when scope-related fields are sent without changing `appliesTo`.

Required changes:

- Update discount update validation so scope references remain consistent even on partial updates.
- If `appliesTo` is unchanged, reject references from non-active scopes unless they are explicitly being cleared.
- Ensure only the matching scope foreign key is populated after create or update:
  - `appliesTo = product` -> only `productId` may be set.
  - `appliesTo = price_list` -> only `priceListId` may be set.
  - `appliesTo = marketplace` -> only `marketplaceId` may be set.
- Normalize payloads in `DiscountService` before persistence so unused scope fields are persisted as `null`.
- Add unit tests for:
  - Cross-tenant product discount rejection.
  - Cross-tenant price-list discount rejection.
  - Cross-tenant marketplace discount rejection.
  - Partial update attempting to populate an unrelated scope field.
  - Scope change clearing old references.

Files likely affected:

- `src/backend/prices-api/src/validators/pricing.validators.ts`
- `src/backend/prices-api/src/services/discount.service.ts`
- `src/backend/prices-api/tests/unit/services.spec.ts`
- `src/backend/prices-api/tests/unit/validators.spec.ts`

### 3. Strengthen Price List Relation Isolation

Problem:

`price_list_products` and `price_list_marketplaces` do not include `tenant_id`. The service validates ownership before creating relations, so API usage is protected, but the database does not independently prevent invalid cross-company join rows.

Required changes:

- Evaluate adding `tenant_id` to:
  - `price_list_products`
  - `price_list_marketplaces`
- Prefer composite foreign keys:
  - `(tenant_id, price_list_id)` -> `price_lists(tenant_id, id)`
  - `(tenant_id, product_id)` -> `products(tenant_id, id)`
  - `(tenant_id, marketplace_id)` -> `marketplaces(tenant_id, id)`
- Update Prisma schema and migration accordingly.
- Update seed relation creation to include `tenantId`.
- Update `PriceListService.setProducts` and `setMarketplaces` to write `tenantId`.
- Add tests covering cross-tenant relation rejection and expected relation creation.

Files likely affected:

- `src/backend/prices-api/prisma/schema.prisma`
- `src/backend/prices-api/prisma/migrations/*`
- `src/backend/prices-api/prisma/seed/demo/relations.ts`
- `src/backend/prices-api/src/services/price-list.service.ts`
- `src/backend/prices-api/tests/unit/services.spec.ts`

### 4. Consider Composite Foreign Keys for Discounts

Problem:

`discounts` currently references product, price list, or marketplace by plain ID. Because the scope references are nullable, the code relies on service validation for tenant ownership.

Options:

1. Keep current schema and rely on stricter service validation.
2. Add composite tenant-safe relations where feasible.
3. Split discount scope into separate join/reference tables in a future larger refactor.

Recommended phase-1 hardening:

- Keep the current table structure for now.
- Enforce tenant ownership and scope normalization at the service layer.
- Add tests that prove invalid references are rejected and unused scope fields are cleared.

Future option:

- If discount rules become more complex, introduce explicit discount target tables with tenant-aware constraints.

### 5. Review Tenant-Scoped Query Filters

Required changes:

- Audit all services that bypass `TenantCrudRepository` and use Prisma directly.
- Confirm every direct Prisma query includes `tenantId` when operating on tenant-owned data.
- Pay special attention to:
  - Dashboard aggregations.
  - Price creation and update transactions.
  - Price history creation.
  - Price list relation replacement.
  - API key resolution and external API access.

Files likely affected:

- `src/backend/prices-api/src/services/dashboard.service.ts`
- `src/backend/prices-api/src/services/price.service.ts`
- `src/backend/prices-api/src/services/price-list.service.ts`
- `src/backend/prices-api/src/services/api-key.service.ts`
- `src/backend/prices-api/src/middlewares/api-key.ts`

### 6. Improve Frontend Tenant Switching Safety

Current behavior:

- Global administrators select a company in the shell.
- Tenant-scoped screens reload when the selected company changes.
- Non-global users operate with their own tenant automatically.

Required changes:

- Confirm all tenant-scoped option loaders reload after tenant changes.
- Ensure create/edit modals cannot keep stale product/list/marketplace options after switching company.
- Clear or close active forms when global administrators switch company.
- Add UI tests for tenant switching behavior where practical.

Files likely affected:

- `src/frontend/prices-admin/src/app/shared/crud-page.component.ts`
- `src/frontend/prices-admin/src/app/layout/shell.component.ts`
- Tenant-scoped feature components under `src/frontend/prices-admin/src/app/features/`

### 7. Add Regression Tests

Backend tests should prove:

- Tenant A cannot list, read, update, or delete Tenant B products.
- Tenant A cannot create prices referencing Tenant B product, price list, or marketplace.
- Tenant A cannot create discounts referencing Tenant B records.
- Tenant A cannot attach Tenant B products or marketplaces to its price lists.
- Global admin without `X-Tenant-Id` is blocked from tenant-scoped operations.
- Global admin with `X-Tenant-Id` sees only the selected company data.
- API keys resolve exactly one tenant and external endpoints never accept tenant override.

Frontend tests should prove:

- Global admin tenant selection sends `X-Tenant-Id`.
- Regular users never send `X-Tenant-Id`.
- Tenant-scoped routes require an active tenant for global admins.
- Tenant-scoped pages reload or reset when the active company changes.

### 8. Verification Checklist

Run backend checks:

```bash
cd src/backend/prices-api
npm test
npm run test:cov
npm run build
```

Run frontend checks:

```bash
cd src/frontend/prices-admin
npm test
npm run test:coverage
npm run build
```

If local `npm` is unavailable, run Jest directly from `node_modules` as a fallback for backend unit tests:

```bash
node node_modules/jest/bin/jest.js
```

Manual verification:

- Log in as a global admin.
- Select Company A and create product/list/discount/price.
- Switch to Company B and confirm Company A data is not visible.
- Attempt API calls using Company B IDs while scoped to Company A and confirm rejection.
- Use an API key from Company A and confirm external endpoints expose only Company A data.

## Suggested Implementation Order

1. Add tests for the current expected tenant behavior.
2. Fix discount partial-update scope consistency.
3. Add tenant-safe database constraints to price-list join tables if migration impact is acceptable.
4. Update seeds and services for the join-table schema changes.
5. Improve frontend reset/reload behavior on tenant switch.
6. Run full backend and frontend verification.
7. Update README documentation with the tenant ownership matrix.

## Acceptance Criteria

- Products are company-specific and cannot be seen or referenced across companies.
- Price lists are company-specific and cannot contain products or marketplaces from another company.
- Prices are company-specific and can only reference same-company products, price lists, and marketplaces.
- Discounts are company-specific and can only target same-company products, price lists, or marketplaces.
- Global administrators operate tenant-scoped modules only through an explicit selected company.
- Non-global users cannot override tenant context.
- API keys are bound to one company and cannot be used to access another company's data.
- Unit tests cover the tenant isolation rules above.
