# Price Catalog Access and Exports Implementation Record

Status: Implemented on branch `codex/price-catalog-access-exports`.

This document records the implementation of the price catalog access and
asynchronous export feature. It must be completed before the pull request is
opened and updated whenever the implementation differs from the feature plan.

## Final Change Summary

Implemented changes:

- Added tenant-safe `UserPriceListAccess` and `ExportRequest` models plus
  migration `20260919000200_add_catalog_access_and_exports`.
- Added `price_catalog_viewer` and catalog/access permissions.
- Added user price-list assignment endpoints and the Users-module assignment
  modal.
- Added the Price Lists-module marketplace assignment modal, completing the
  list-to-marketplace setup required by the catalog.
- Added the read-only Angular price catalog with list and marketplace selectors.
- Added current discount calculation through the existing pricing engine.
- Added queued CSV, JSON, and TXT export requests, local storage, serializers,
  download authorization, and `npm run worker:exports`.
- Export request creation persists only `createdBy` and `createdByType`, which
  are the audit columns defined for `ExportRequest`.

## Database and Migration

Implemented:

- New enums: `ExportFormat` and `ExportStatus`.
- New tables: `user_price_list_access` and `export_requests`.
- Added `users (tenant_id, id)` uniqueness for tenant-safe user relations.
- Added composite tenant foreign keys to users, price lists, marketplaces, and
  the assignment/export tables.
- Applied migration with Prisma migrate deploy against the local MySQL
  database.
- Production startup must apply migrations before starting the API or worker.

## Permissions and Access Rules

Implemented:

- `price-catalog:read`, `price-catalog:read-all`, `price-catalog:export`,
  `price-list-access:read`, and `price-list-access:manage`.
- `price_catalog_viewer` receives only assigned-list read and export access.
- Company/global administrators receive tenant-wide catalog access through
  `price-catalog:read-all`.
- Downloads revalidate current list visibility and expire with the job.

## API Contract

Implemented:

- `GET/PUT /users/:id/price-list-access` manage assignments.
- `PUT /price-lists/:id/marketplaces` replaces the active marketplace
  associations for a price list.
- `GET /price-catalog/price-lists`,
  `GET /price-catalog/marketplaces?priceListId=...`, and
  `GET /price-catalog?...` serve the read-only catalog.
- `POST/GET /price-catalog/exports`,
  `GET /price-catalog/exports/:id`, and
  `GET /price-catalog/exports/:id/download` manage exports.
- Catalog and export requests require tenant context and the relevant
  permissions; unassigned lists are not returned.

## Frontend Changes

Implemented:

- Added `/price-catalog` with list, marketplace, search, price, discount, and
  final-price views.
- Added export history and completed-file download controls.
- Added user assignment modal and tenant-switch reset behavior.
- Added marketplace assignment from each price-list row, preloaded from the
  existing price-list detail response.
- Added catalog-only route fallback for users without dashboard access.

## Worker and Storage Operations

Implemented:

- Worker command: `npm run worker:exports`.
- Jobs are claimed from MySQL, retried up to three times, and stale processing
  locks can be reclaimed after ten minutes.
- `EXPORT_DIRECTORY` defaults to `storage/exports` and
  `EXPORT_RETENTION_HOURS` defaults to 24.
- Local storage is implemented; object storage remains an operational adapter
  extension for production deployments.
- CSV uses UTF-8 with formula-cell protection, JSON uses a metadata envelope,
  and TXT uses UTF-8 tab-separated rows.

## Security Notes

Implemented with service-level and serializer coverage:

- Confirm tenant-safe database constraints and service-level checks.
- The service layer rejects queries for unassigned price lists and rechecks
  access before downloads.
- End-to-end revocation and download behavior still requires the manual
  two-company smoke test.
- CSV formula-injection handling is covered by serializer tests.

## Verification Evidence

Verification results:

```text
Backend unit/API tests: 13 suites, 326 tests passed.
TypeScript build: passed with `tsc --noEmit`.
Prisma validation: passed.
Prisma client generation: passed.
Migration deployment: passed; database schema is up to date.
Frontend unit tests: passed, 174 tests in Chrome Headless.
Frontend development build: passed with `ng build --configuration development`.
Manual two-company smoke test: pending.
```

## Deviations from the Plan

The initial implementation exposed the user-to-price-list assignment but did
not expose the existing price-list-to-marketplace association in the Angular
UI. This was corrected with the Price Lists marketplace-assignment modal; no
new database structure, endpoint, or permission was required.

Export requests originally reused a generic creation-audit helper that also
supplied update-audit columns. `ExportRequest` intentionally has no
`updatedBy` or `updatedByType` columns, so the service now supplies only its
defined creation-audit fields and the export service test asserts that
constraint.
