# Tenant Time Zone and Business-Date Plan

## Status

Implemented on branch `codex/tenant-time-zone-business-date`. The companion
implementation record is stored in
`agent/TENANT_TIME_ZONE_BUSINESS_DATE_IMPLEMENTATION.md`.

## Objective

Allow each company to configure its business time zone and make price and
discount validity use that company's calendar day. A date selected as
`2026-09-19` must be valid from `00:00:00` through `23:59:59.999` in the
company's configured time zone.

## Problem Statement

The current UI submits date-only values by converting them to ISO timestamps.
For example, `2026-09-19` becomes `2026-09-19T00:00:00.000Z`. The pricing
engine compares that instant with the current UTC timestamp, so an end date can
expire before the selected business day is over in the company's local time.

The problem affects both discounts and price availability because both use
date-only inputs backed by `DateTime` database columns.

## Design Decisions

### Use IANA time zone identifiers

Store a named IANA zone, such as `America/Mexico_City`, in the tenant record.
The UI may show a friendly offset label, such as `UTC-06:00`, but must persist
the IANA identifier rather than a fixed offset. This keeps future daylight
saving and regional offset changes correct.

### Treat validity as business dates

`startDate` and `endDate` represent dates, not arbitrary timestamps:

- A start date is inclusive at the beginning of the business day.
- An end date is inclusive through the end of the business day.
- A missing end date remains open-ended.
- A record is applicable only when the current business date, evaluated in the
  tenant time zone, is inside the inclusive range.

### Store date-only data

Change price and discount validity columns from MySQL `DATETIME(3)` to MySQL
`DATE`. Prisma will continue to expose them as `DateTime` values annotated with
`@db.Date`, but application code must treat their UTC date components as a
calendar value, never as an instant.

This is the clearest representation of the domain and preserves the calendar
date of the existing records during migration.

### Centralize business-date logic

Introduce one backend utility responsible for:

- validating a supplied IANA time zone;
- resolving the tenant time zone, defaulting to `UTC` only for legacy rows;
- obtaining the current `YYYY-MM-DD` business date in a time zone;
- converting API date strings to database date values without local-browser
  timestamp conversion;
- comparing inclusive date ranges.

Use a mature time-zone library such as `luxon`, or the runtime's ICU-backed
named-zone API, rather than custom offset math.

## Data Model and Migration

1. Add `timeZone String @default("UTC") @map("time_zone") @db.VarChar(64)` to
   the `Tenant` Prisma model.
2. Change `Price.startDate`, `Price.endDate`, `Discount.startDate`, and
   `Discount.endDate` to `@db.Date`.
3. Create a new Prisma migration that:
   - adds `tenants.time_zone` as non-null with default `UTC`;
   - converts the four existing `DATETIME(3)` columns to `DATE`;
   - preserves each existing UTC calendar date while dropping the obsolete
     time component;
   - keeps nullable end-date columns nullable.
4. Regenerate Prisma Client and validate the migration against a local copy of
   the database before deployment.
5. Do not rewrite historical price amounts or discount amounts. The change only
   corrects the calendar interpretation of validity dates.

## Authorization and API Changes

The existing `settings:read` and `settings:update` permissions are sufficient.
`tenant_admin` already receives `settings:update`; catalog viewers and ordinary
operators must not receive it unless an administrator explicitly grants it.

Add company-context endpoints:

```text
GET   /api/v1/tenants/me/time-zone
PATCH /api/v1/tenants/me/time-zone
```

Requirements for both endpoints:

- Use JWT authentication, tenant resolution, and required tenant context.
- `GET` requires `settings:read`.
- `PATCH` requires `settings:update`.
- Never accept a tenant id in the body or path.
- Validate the IANA identifier and audit the update with the current actor.
- Return the selected IANA identifier and a display-ready label or offset.

Keep global-only company CRUD endpoints unchanged. A company administrator may
update only the time zone of the company resolved from that administrator's
session.

Extend `GET /api/v1/tenants/me` and tenant DTOs to include `timeZone` so the
frontend can render the current company setting.

## Backend Implementation Steps

1. Add `luxon` and its TypeScript types, or the chosen established time-zone
   library, to the backend dependencies.
2. Implement the business-date utility and unit tests before changing pricing
   behavior.
3. Update tenant validation schemas to accept a valid IANA zone on company
   creation and controlled time-zone updates.
4. Add a tenant settings controller/service method for the new `/me/time-zone`
   endpoints and register the routes with tenant-context and permission guards.
5. Update tenant repository selections, serializers, frontend-facing models,
   seed data, and fake Prisma records for `timeZone`.
6. Change pricing validators to accept and validate date-only strings in
   `YYYY-MM-DD` form. Reject timestamps for new and updated price or discount
   validity fields to prevent accidental UTC conversion.
7. Update `DiscountService` and `PriceService` to normalize API dates as
   database business dates, using the configured tenant time zone only to
   evaluate the current date.
8. Update `pricing.engine.ts` so `isWithinValidity` and
   `selectApplicableDiscount` compare business dates inclusively in the passed
   tenant time zone.
9. Update `PriceCatalogService` to:
   - load the tenant time zone once per catalog request;
   - filter price validity against the tenant business date;
   - pass the same zone/date context to the pricing engine.
10. Update `PriceService.preview`, create, and update flows to use the same
    tenant time zone. The admin price preview and the read-only catalog must
    return the same applied discount for the same input.
11. Update `DashboardService` expiration calculations to use tenant business
    dates and a calendar-day window rather than a fixed 24-hour UTC interval.
12. Confirm that exports need no separate time-zone calculation. The export
    worker already calls `PriceCatalogService`; its results must inherit the
    corrected catalog behavior.

## Frontend Implementation Steps

1. Add `timeZone` to the Angular `Tenant` model and current-company service
   response types.
2. Extend Settings with a company time-zone section:
   - show the current time zone and current local business time;
   - list supported IANA zones with a searchable select control;
   - display each option as its current UTC offset plus IANA identifier;
   - disable saving for users without `settings:update`.
3. Add `getTimeZone()` and `updateTimeZone()` methods to `TenantService`.
4. Add a `tenantGuard` and `settings:read` route guard to Settings so users
   cannot reach it without a company context or read permission.
5. Update company creation and global company editing to show the time zone,
   with `UTC` as a safe default. Global administrators may set it while creating
   a company, but company administrators own its day-to-day configuration.
6. Remove `new Date(value).toISOString()` from price and discount payload
   mappers. Send plain `YYYY-MM-DD` values instead.
7. Update date form mappers so an end date always returns the same calendar day
   in the selected control, independent of the browser's local zone.
8. Keep the catalog presentation unchanged except that the returned discount
   must reflect the corrected business-date calculation.

## Existing Data and Rollout

1. Backfill every tenant with `UTC` in the database migration.
2. On deployment, existing price and discount dates retain their visible
   calendar date because the migration converts `DATETIME` to `DATE`.
3. Ask each company administrator to select its business time zone in Settings.
4. Until a company changes from the default `UTC`, its behavior remains stable
   and backward compatible.
5. When a company selects a zone, its existing dates immediately become dates
   in that business calendar. No manual re-entry of active discounts should be
   required.
6. Show a concise settings warning when the company still uses the default UTC
   value, unless UTC is intentionally selected by the company administrator.
7. Document that changing a company time zone changes the calendar used to
   evaluate future requests; restrict this setting to authorized administrators
   and retain audit columns on the tenant update.

## Test Plan

### Business-date utility

- Accept valid IANA zones and reject invalid values.
- Resolve `2026-09-19` correctly in `UTC`, `America/Mexico_City`, and a zone
  with daylight-saving transitions.
- Return the correct local business date immediately before and after midnight.

### Pricing engine and services

- A one-day discount applies at `00:00:00` through `23:59:59.999` in the tenant
  zone.
- The same discount does not apply at the following local midnight.
- Product, price-list, and marketplace discount precedence remains unchanged.
- An inactive, deleted, not-yet-started, or expired discount never applies.
- Price availability uses the same inclusive date semantics.
- Preview, catalog, and export return identical discount results for a given
  tenant, date, product, list, and marketplace.

### Tenant isolation and authorization

- A company administrator can read and update only its own time zone.
- A tenant id supplied by a client cannot redirect a settings update to another
  company.
- A user without `settings:update` receives `403` for the update endpoint and
  sees a read-only setting in the UI.
- A global administrator can manage the selected company context without
  bypassing tenant isolation.

### Frontend

- Settings loads the current company zone and persists a selected zone.
- The zone selector filters and renders an offset plus IANA label.
- Price and discount payloads contain `YYYY-MM-DD`, not ISO midnight strings.
- Edit forms preserve the chosen start and end calendar dates.
- Catalog shows a discount on the configured end date and omits it the next
  local day.

### Regression and verification

- Run Prisma validation, client generation, and migration deployment.
- Run all backend unit/API tests and TypeScript type checks.
- Run all frontend unit tests and a production or development build.
- Perform a manual two-company smoke test using different zones and the same
  calendar date.
- Run a catalog export for each company and verify it matches the on-screen
  calculated discount.

## Documentation Deliverables

Update the following after implementation:

- `README.md`: tenant time-zone configuration, date-only validity semantics,
  settings endpoint, and operational behavior.
- `agent/TENANT_TIME_ZONE_BUSINESS_DATE_IMPLEMENTATION.md`: implementation
  record, migration result, API contract, verification evidence, and any
  deviations from this plan.
- Existing catalog/export documentation when its date behavior changes.

## Acceptance Criteria

1. Every company has a valid configured IANA time zone.
2. A company administrator with `settings:update` can configure only its own
   company time zone.
3. A discount beginning and ending on `2026-09-19` applies throughout that
   entire date in the company zone and nowhere outside it.
4. Catalog, price preview, API, queued export, and dashboard use the same
   business-date rule.
5. No cross-tenant time-zone or discount calculation can occur.
6. Existing calendar dates remain intact after migration.
7. Automated tests cover the date boundary, tenant authorization, and
   cross-zone behavior.
