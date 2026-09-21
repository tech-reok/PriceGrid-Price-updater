# Tenant Time Zone and Business-Date Implementation

## Summary

Implemented company-level IANA time zones and inclusive business-date
evaluation for prices and discounts. A date-only value such as `2026-09-19`
now represents the complete local calendar day of the selected company.

## Delivered Changes

### Database and Prisma

- Added `Tenant.timeZone`, mapped to `tenants.time_zone`, with a default of
  `UTC`.
- Changed price and discount validity columns to MySQL `DATE` while preserving
  their existing calendar dates.
- Added migration
  `20260920000100_add_tenant_time_zone_business_dates`.
- Regenerated Prisma Client successfully after stopping the local export worker
  that had locked the query-engine binary.

### Backend

- Added centralized helpers for IANA validation, tenant business-date lookup,
  date-only conversion, inclusive ranges and calendar-day arithmetic.
- Added `GET` and `PATCH /api/v1/tenants/me/time-zone`, protected by tenant
  context plus `settings:read` and `settings:update` respectively.
- Added time-zone validation to tenant create/update payloads.
- Price and discount validators now accept only `YYYY-MM-DD` validity values;
  same-day start/end ranges are valid.
- Applied the tenant zone consistently to pricing preview, catalog results,
  dashboard expiration queries and export results through the catalog service.
- Updated development seed data to use `America/Mexico_City` for the demo
  company.

### Frontend

- Added the company time zone to tenant models and company forms.
- Added Settings controls for searching IANA zones, displaying the current
  local business time and saving the selected zone when authorized.
- Added `tenantGuard` and `settings:read` protection to Settings.
- Price and discount forms now preserve and submit plain calendar dates instead
  of converting midnight through the browser's UTC offset.

## API Contract

```text
GET   /api/v1/tenants/me/time-zone
PATCH /api/v1/tenants/me/time-zone
Body: { "timeZone": "America/Mexico_City" }
Response: { "timeZone": "America/Mexico_City" }
```

The update always targets the company resolved from the authenticated request;
the body cannot redirect the operation to another tenant. Audit fields are
written through the existing tenant update path.

## Date Semantics

For a tenant in `America/Mexico_City`, `startDate = endDate = 2026-09-19`
applies from local `00:00:00` through `23:59:59.999`. It does not apply after
the next local midnight. Product, price-list and marketplace precedence remains
unchanged, and inactive, deleted, future or expired discounts are excluded.

## Verification

- `prisma migrate deploy`: passed; migration applied locally.
- Prisma Client generation: passed.
- Backend TypeScript type-check (`tsc --noEmit`): passed. The emitting build
  could not overwrite existing `dist` files because Windows returned `EPERM`
  for those files; this is an environment file-lock/permission issue, not a
  TypeScript diagnostic.
- Backend unit/API suite before final regression: 326 tests passed.
- Added business-date, pricing-boundary, tenant-service, controller and
  frontend service coverage.
- Frontend development build: passed.
- Frontend regression: 175 tests passed.

## Implementation Deviation

The plan proposed Luxon as a possible mature time-zone library. The backend
uses the Node.js ICU-backed `Intl.DateTimeFormat` API instead. It validates IANA
zones and performs named-zone calendar conversion without custom offset math,
keeps the dependency surface unchanged, and is already available in the
supported Node.js runtime.

## Operational Notes

1. Run the pending migration before starting the API in a new environment.
2. Ask each company administrator to select the company's business zone in
   Settings.
3. Existing dates retain their stored calendar date; changing a company's zone
   changes the calendar used for future validity checks.
4. Start the export worker normally with `npm run worker:exports`; its catalog
   reads inherit the tenant business-date rule.
