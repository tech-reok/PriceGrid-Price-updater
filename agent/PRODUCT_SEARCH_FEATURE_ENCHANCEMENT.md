# Product Search Feature Enhancement Plan

## Objective

Improve product discovery in the price-management workflow so a user can:

1. Search the **Prices** table by a product's SKU or name.
2. Select a product efficiently while creating a price, without loading or
   rendering the entire product catalog in a native dropdown.
3. Search **Price History** by the SKU or name of the related product.

The feature must preserve the existing tenant isolation, role permissions,
status filters, pagination, audit trail, and runtime Spanish/English language
switching.

## Scope

### Included

- Replace the current Prices search semantics, which only search `Price.notes`,
  with product SKU/name search.
- Replace the product `<select>` in the Add Price form with an asynchronous
  autocomplete/typeahead control.
- Replace Price History's reason-based search with product SKU/name search.
- Add frontend and backend unit coverage for the new behavior.
- Update Spanish (`es-419`) and English (`en-US`) UI copy.

### Explicitly excluded

- Full-text search across every product attribute, price-list name,
  marketplace, notes, discount, or history reason.
- Changes to the price-calculation algorithm, price uniqueness constraints, or
  price-history append-only behavior.
- A new public/external API endpoint.
- Importing a third-party autocomplete package. Angular CDK is already a
  project dependency and may be used for overlay/focus utilities if useful.
- Database schema changes in the first implementation. Indexing will be
  revisited only after measuring real catalog size and query latency.

## Current State and Root Cause

### Prices list

`CrudPageComponent` already debounces the toolbar field and issues list
requests as `?search=<term>`. The backend generic repository builds its text
filter using `MODEL_OPTIONS`.

The `price` configuration currently has:

```ts
searchableFields: ['notes']
```

Consequently, `GET /prices?search=ABC-123` applies an `OR` condition to
`Price.notes` only. The related `Product` is included in the response for
display, but it is never used in the query predicate.

### Add Price form

The Prices feature loads its `products` select source once with:

```ts
this.productService.list({ limit: 100 })
```

The shared CRUD template renders that result as a native `<select>`. This has
two failures at scale:

- Only the first 100 products are available.
- Even if the limit were raised, a long native dropdown is difficult to scan
  and inefficient to render or transfer.

The existing `GET /products` endpoint is sufficient for a typeahead: its
configured searchable fields are already `sku` and `name`, it is tenant scoped,
and it supports pagination.

### Price History

`PriceHistory` is also rendered through `CrudPageComponent`; its generic search
configuration currently targets `reason`. The history response already includes
the related product, so it requires the same relation-aware query capability as
Prices.

### Existing price catalog

The separate **Price Catalog** module already filters its rows with a SKU/name
comparison. It is not part of this change, except as a behavioral reference.
This plan applies to the administrative **Prices** and **Price History**
screens shown in the request.

## UX and Functional Design

### A. Prices table search

- Placeholder: **"Buscar por SKU o nombre…"**.
- A non-empty term matches when the related product's SKU or name contains the
  term.
- The request remains debounced by the existing 300 ms toolbar behavior.
- A new term resets pagination to page 1; active/inactive chips and sorting
  remain in effect.
- Search is server-side. It must operate over all eligible price rows, not just
  the rows in the current browser page.
- `notes` no longer participate in the toolbar search. Notes remain editable
  and visible only where the product currently uses them.

### B. Product autocomplete in Add Price

The Product field in the create-price modal will become a combobox/typeahead.

| Interaction | Expected behavior |
| --- | --- |
| Initial state | Empty input with a localized prompt to search by SKU or name. No catalog download occurs merely by opening the form. |
| Typing | After at least 4 characters and 250–300 ms without further input, request active products with `search`, `page=1`, and `limit=30`. |
| Results | Show SKU and name in one consistent label: `SKU — Product name`. |
| Selection | Clicking a result or pressing Enter assigns its ID to `productId`; the displayed label remains visible. |
| Keyboard | Up/Down changes the active option; Enter selects; Escape closes; Tab leaves the component without unintentionally selecting an item. |
| Loading/error/empty | Indicate loading, no results, and retry-safe failures without treating a failed request as a valid selection. |
| Clearing | Clearing the field clears `productId`, so normal required validation prevents saving. |
| Edit modal | The already associated product is displayed as a non-editable selection. Product references are immutable on updates and the API already rejects their mutation. |
| Tenant change | Results must be cleared/cancelled when the active company changes. A response belonging to the prior tenant must never be selectable. |

The other select fields in the form (price list, marketplace, and currency) are
out of scope. They retain their present behavior.

### C. Price History search

- Placeholder: **"Buscar por SKU o nombre…"**.
- Use the same matching behavior as the Prices table.
- The history remains read-only and append-only. No filters or mutations beyond
  the existing page controls are added.

## Backend Design

### API contract

No route needs to be added or renamed.

| Endpoint | New/updated semantics |
| --- | --- |
| `GET /api/admin/prices?search=<term>&status=<state>&page=<n>&limit=<n>` | `search` matches related `Product.sku` OR `Product.name`, within the resolved tenant. It no longer queries `Price.notes`. |
| `GET /api/admin/price-history?search=<term>&page=<n>&limit=<n>` | `search` matches related `Product.sku` OR `Product.name`, within the resolved tenant. It no longer queries `PriceHistory.reason`. |
| `GET /api/admin/products?search=<term>&status=active&page=1&limit=30` | Existing endpoint used by the typeahead. Its established SKU/name search behavior is retained. |

The exact API base prefix depends on the existing environment configuration; no
frontend code should hard-code it.

### Relation-aware search extension

The generic repository only knows how to create direct scalar predicates from
`searchableFields`. Do not add strings such as `product.sku` to that array:
Prisma relation filters require a nested object and a dot-path would silently
generate an invalid query shape.

Recommended implementation:

1. Extend `CrudModelOptions` with an optional typed search builder, for example
   `searchWhere?: (term: string) => Record<string, unknown>[]`.
2. Update `TenantCrudRepository.buildWhere()`:
   - retain its direct-field behavior for models without `searchWhere`;
   - when a `searchWhere` builder exists, assign the returned clauses to the
     current `where.OR` condition;
   - continue adding tenant, soft-delete, status, and exact filter predicates
     in the outer `where` object;
   - normalize the search term and skip the `OR` clause entirely when it is
     empty or whitespace. This is a guard that belongs to the shared method, so
     no model can ever emit `OR: []` (a Prisma error) or
     `contains: ''` (which matches every row).
3. Configure `price` and `priceHistory` with a product relation builder such
   as:

```ts
[
  { product: { is: { sku: { contains: term } } } },
  { product: { is: { name: { contains: term } } } }
]
```

4. Remove `notes` from `price.searchableFields` and `reason` from
   `priceHistory.searchableFields`, so the documented behavior and actual
   query cannot diverge.

This declarative approach keeps the behavior close to the existing model
configuration and is preferable to special-casing HTTP controllers or adding
a separate Price repository solely for this search.

### Security and correctness constraints

- Tenant scoping (`tenantId`) and soft-delete filtering must remain outside the
  `OR` search block, otherwise an `OR` clause could weaken either constraint.
- Price and history results must preserve their existing product `include`
  selections.
- The products endpoint will receive `status=active` for new price selection.
  The backend still remains the authority that validates every supplied
  reference belongs to the tenant when a price is created.
- Confirm that roles allowed to create prices also have `products:read`.
  The existing dropdown already requires that permission; if the authorization
  matrix lacks it, correct the role seed/policy as a separate, intentional
  permission change.

### Performance decision

The initial matching mode is substring search (`contains`) for predictable UX.
The typeahead sends no more than 30 rows per request and requires four typed
characters, which keeps the query explicit without raising the API-wide
`MAX_LIMIT` of 100 (`src/common/utils/pagination.ts`). This is adequate for the
stated problem of catalogs larger than 100 products.

Note that `Product` is only indexed on `tenant_id` today; there is no
`(tenant_id, sku)` or `(tenant_id, name)` index, so `contains` scans the rows of
the resolved tenant. Measurement remains the gate for any index work.

Standard B-tree indexes do not efficiently accelerate arbitrary `%term%`
searches. Before adding a migration, measure production-like MySQL query plans
and latency. If scale requires it, choose one explicitly:

- SKU prefix matching plus a composite `(tenant_id, sku)` index for the
  typeahead; or
- a MySQL FULLTEXT index/search strategy for SKU/name, with documented
  tokenization, accent, and minimum-token behavior.

Do not add speculative indexes during this feature without those measurements.

## Frontend Design

### Shared autocomplete component

Create a small, reusable standalone component under `src/app/shared/ui/`, for
example `async-autocomplete.component.ts`. It should implement
`ControlValueAccessor` so it can be used by the Reactive Form that
`CrudPageComponent` creates.

Suggested component inputs:

| Input | Purpose |
| --- | --- |
| `id` | Connect input, label, and accessibility attributes. |
| `placeholder` | Localized prompt from the caller. |
| `search` | Function receiving typed text and returning `Observable<FieldOption[]>`. |
| `minLength` | Default 4. |
| `debounceMs` | Default 250 or 300. |
| `disabled` | Supports immutable product display in the edit modal. |
| `testId` | Stable hook for UI tests. |

The component should expose `role="combobox"`, `aria-expanded`,
`aria-controls`, `aria-activedescendant`, and a list with `role="listbox"` /
`role="option"`. Use the Angular CDK overlay for the suggestion panel: the modal
shell is `fixed inset-0 ... overflow-y-auto` with a `relative` card, so an
absolutely positioned list would be clipped for the product field on the first
row. This is a deliberate decision to introduce `@angular/cdk/overlay` (already a
dependency, not yet imported anywhere).

Adding the overlay requires one global stylesheet line, placed **before** the
Tailwind directives so the layer order is preserved:

```css
@import '@angular/cdk/overlay-prebuilt.css';
@tailwind base;
```

The panel renders outside the component's DOM subtree. As `styles.css` already
defines `pg-input`, `pg-card` and the other component classes in a global
`@layer components`, and no component uses `ViewEncapsulation.None`, the
suggestion list can reuse those classes and Tailwind utilities without
duplicating CSS.

The minimum length of 4 characters relies on an explicit product invariant:
**every SKU has at least 4 characters**. That invariant is *not* enforced yet —
`pricing.validators.ts` currently declares `sku: z.string().trim().min(1).max(64)`,
and the SKU import validation is planned separately. Track it as a dependency:
until the import enforces it, a product created through the API with a shorter
SKU would not be selectable in the typeahead. The typeahead adds no code
exception for short SKUs; the invariant is the contract, and the SKU import is
the enforcement point.

It must cancel obsolete searches (`switchMap` or equivalent) and reset the
suggestions when the query falls below the minimum length, when a selection is
made, when disabled, or when its host closes the modal.

### CRUD page integration

Update the shared form metadata and rendering flow:

1. Add `'autocomplete'` to `FieldType` in `crud-page.types.ts`.
2. Add a field-specific asynchronous source declaration, distinct from the
   current eager `selectSources` loader. Its type must accept the typed query.
3. Render `AsyncAutocompleteComponent` for that field type in
   `crud-page.component.html`.
4. Keep eager `selectSources` unchanged for the existing normal `<select>`
   controls, avoiding a regression in other CRUD modules.
5. Ensure the generic required/error styles and field error text work for an
   autocomplete control in exactly the same way as they do for selects.
6. Add an optional per-field `initialOption?: (row: any) => FieldOption | null`
   to `FieldConfig`, resolved by `openEdit()` into a page-level map and passed to
   the control. It exists because the eager `selectSources` cache is loaded once
   per page and cannot supply a per-row label. The autocomplete uses it only to
   render the existing selection in edit mode; the form control keeps holding the
   plain id, so `mapToPayload` and the preview runner are untouched.
7. Add an optional `disabledOnEdit` flag so an immutable reference is rendered
   read-only while editing instead of looking editable.
8. Extend the existing `tenantContext.changes` subscription: it currently only
   reloads the listing, so it must also close the modal, clear the `options()`
   cache and call `loadOptions()` again. Without this, the eager selects keep the
   previous company's options while the modal is open — a pre-existing bug that
   the typeahead would make more visible.

### Prices feature integration

In `PricesComponent`:

- change the `productId` field from `select` to `autocomplete`;
- replace the `limit: 100` product source with a query-aware source that calls
  `ProductService.list({ search, status: 'active', page: 1, limit: 30 })`;
- map API products to `FieldOption` labels using `SKU — name`;
- provide an initial display option from `row.product` for edit mode through
  `initialOption`, then disable the field while editing (see the CRUD page
  integration section);
- leave payload mapping unchanged: selected `productId` is submitted only on
  creation and is omitted on update;
- preserve the price calculation preview, which consumes `productId` directly.

### Localization

Add complete, non-concatenated copy to both translation catalogs. At minimum:

- `prices.searchPlaceholder`: "Buscar por SKU o nombre…" / "Search by SKU or
  name…";
- `priceHistory.searchPlaceholder`: same behavior/copy;
- autocomplete placeholder, loading, no results, clear selection, and any
  accessibility labels necessary for the new control.

Run the repository's i18n scan and key-coverage checks after adding keys.

## Files Expected to Change

| Area | File(s) | Change |
| --- | --- | --- |
| Backend query model | `src/backend/prices-api/src/common/crud/types.ts` | Add the optional relation-aware text search hook. |
| Backend query execution | `src/backend/prices-api/src/common/crud/repository.ts` | Apply either direct or configured relational text search while preserving base predicates. |
| Backend model rules | `src/backend/prices-api/src/repositories/model-options.ts` | Define SKU/name predicates for price and price history. |
| Backend tests | `src/backend/prices-api/tests/unit/crud.spec.ts`, `tests/helpers/fake-prisma.ts` as needed | Validate nested relation filters in the test double and repository behavior. |
| Shared UI contract | `src/frontend/prices-admin/src/app/shared/crud-page.types.ts` | Declare autocomplete field/source types. |
| Shared UI implementation | `src/frontend/prices-admin/src/app/shared/ui/async-autocomplete.component.ts` (new) | Implement accessible asynchronous CVA control. |
| Global styles | `src/frontend/prices-admin/src/styles.css` | Import the CDK overlay stylesheet ahead of the Tailwind directives. |
| Shared CRUD form | `src/frontend/prices-admin/src/app/shared/crud-page.component.ts`, `crud-page.component.html` | Route autocomplete fields to the new component, resolve per-field `initialOption`, honour `disabledOnEdit`, and clear/reload options on a company switch. |
| Price feature | `src/frontend/prices-admin/src/app/features/prices/prices.component.ts` | Use the async product source and update field configuration. |
| History feature | `src/frontend/prices-admin/src/app/features/price-history/price-history.component.ts` | Consume the revised localized product search placeholder. |
| Frontend tests | shared component specs, `feature-logic.spec.ts`, `services.spec.ts`, `features.spec.ts` as applicable | Cover requests, selection, validation, display, and translation. |
| Localization | `src/frontend/prices-admin/src/app/core/i18n/catalogs/es-419.json`, `en-US.json` | Add/update all copy. |

## Implementation Sequence

1. **Lock the API semantics.** Add relation-aware model configuration and
   backend unit tests before altering the UI. Note that `tests/helpers/fake-prisma.ts`
   currently returns `true` for any filter operator it does not understand
   ("Relation filters are not simulated"), so a relation test would pass without
   filtering anything. Assert the exact `buildWhere()` output first, then extend
   the double's relation matching minimally and make unevaluable filters fail
   loudly instead of matching everything. Verify that status/pagination and
   tenant constraints remain correct.
2. **Build and unit-test the autocomplete in isolation.** Do not first embed
   one-off search logic in the Prices component; the form needs a proper
   reactive-form control. Add the CDK overlay stylesheet import at this point.
3. **Extend the shared CRUD form contract.** Add the new field type without
   changing existing select source behavior, plus `initialOption` and
   `disabledOnEdit`. Include the company-switch cleanup (close modal, clear and
   reload cached options) in this step, since it touches the same component.
4. **Wire the Prices screen.** Replace the 100-item source, preserve form
   payloads and the preview calculation, and update translated copy.
5. **Wire Price History copy/behavior.** Its search behavior becomes correct
   through the backend configuration; update its placeholder and add a screen
   assertion.
6. **Run regression verification.** Execute backend tests, frontend tests,
   frontend build, and i18n checks. Perform a manual desktop and narrow-modal
   pass with a tenant containing more than 100 products.

## Test Plan

### Backend unit tests

- `price` search matches an SKU and a distinct product name.
- `price` search returns no match for text found only in `notes`.
- `priceHistory` search matches related SKU/name and not only `reason`.
- A search result remains constrained by tenant, `deletedAt`, and, for Prices,
  the requested status.
- Pagination metadata and pages are correct after filtering.
- A cross-tenant product/price is never returned.
- The fake Prisma relation matcher is upgraded only as far as needed to make
  these assertions meaningful; it must not treat all relation filters as true.

### Frontend unit tests

- The autocomplete waits for the configured debounce and minimum length before
  invoking the product service.
- It sends `search`, `status=active`, `page=1`, and `limit=30`.
- A selection writes the expected product ID to the form control and displays
  its SKU/name label.
- Keyboard selection, Escape, clear, loading, empty result, and error states
  behave as specified.
- A required autocomplete with no selection blocks submission and presents the
  existing validation treatment.
- Editing an existing price displays its linked product from `initialOption`
  without issuing a product request, and does not submit a changed `productId`.
- Switching the active company closes the modal, clears the cached select
  options and reloads them, so no previous-tenant option stays selectable.
- Prices and Price History send their toolbar term as `search`; their localized
  placeholders update under a runtime locale switch.

### Manual acceptance pass

Use a tenant with at least 101 active products and verify:

1. A product beyond the former first 100 is findable and selectable by exact
   SKU, prefix, and a portion of its name.
2. Creating a price with that product persists the expected `productId` and
   calculates the preview normally.
3. The Prices table finds every matching price by SKU/name and no longer finds
   a row only because its notes match.
4. The Price History page finds corresponding entries by SKU/name.
5. Switching the selected tenant neither displays stale suggestions nor leaks
   a prior tenant's product in selection/results.
6. Spanish and English have no raw translation keys or truncated controls.

## Definition of Done

- Prices and Price History product searches are server-side, paginated, tenant
  safe, and match SKU/name according to this document.
- The Add Price product control is an accessible asynchronous typeahead; it
  does not preload the catalog and has no 100-product ceiling.
- A company switch never leaves a previous-tenant option selectable, and no
  stale select option survives the switch.
- Existing create, edit, delete, calculation-preview, status, pagination, and
  permissions behavior passes regression tests.
- English and Spanish translations are complete and verified by the existing
  i18n scripts.
- Backend and frontend test suites and builds pass without introducing a
  database migration unless performance measurements justify one.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| A relation `OR` weakens tenant or soft-delete predicates | Build the search clauses beneath an outer base `where`; add tenant-isolation tests. |
| Slow substring queries at a future large scale | Limit typeahead responses, require four characters, measure, then introduce an evidence-based index/search strategy. |
| Stale asynchronous responses overwrite newer text or tenant context | Use `switchMap`, close the modal and clear the option cache when the company changes, and rely on tenant-scoped API requests. |
| Generic CRUD changes regress other forms | Keep `selectSources` untouched and cover both normal select and autocomplete rendering in shared-component tests. |
| An editable-looking product field misleads users during price edit | Display it disabled/read-only because price references are immutable on update. |
| A product with a SKU shorter than 4 characters cannot be found in the typeahead | The four-character minimum is backed by the "every SKU has at least 4 characters" invariant. The API validator still allows `min(1)` (`pricing.validators.ts`), so the SKU import validation is a tracked dependency of this feature, not an optional follow-up. |

## Implementation Status

All six phases are implemented. Verification performed:

| Check | Result |
| --- | --- |
| Backend unit tests (`jest --runInBand`) | 400 passing |
| Frontend unit tests (`ng test --browsers=ChromeHeadless`) | 363 passing |
| Frontend production build (`ng build`) | clean, no template or type errors |
| Backend type check (`tsc --noEmit`) | clean |
| i18n scan and key coverage (`npm run i18n:check`) | clean, 352 referenced keys resolved in both locales |

Decisions taken during implementation that refine this document:

- The typeahead threshold is **4 characters with `limit=30`**, not 2 with `limit=20`.
- The suggestion panel uses the **Angular CDK overlay**, and `styles.css` imports
  `@angular/cdk/overlay-prebuilt.css` ahead of the Tailwind directives.
- The edit case is served by a per-field `initialOption` resolved from the row
  (`row.product`), which is why the eager `selectSources` cache did not need to
  change.
- `disabledOnEdit` disables the form control programmatically. A `[disabled]`
  binding next to `formControlName` is rejected by Angular, and a disabled
  control still participates in `getRawValue()`, so the preview keeps working.

### Not verified in this session

The manual acceptance pass needs a running API, a browser and a tenant with at
least 101 active products. The local development database holds 8 products, so
the following remain to be checked by hand:

1. A product beyond the former first 100 is findable by exact SKU, prefix and
   part of its name.
2. Creating a price with that product persists the expected `productId` and the
   preview still calculates.
3. The Prices table finds matching prices by SKU/name and no longer matches on
   `notes`.
4. Price History finds entries by SKU/name.
5. Switching tenant shows no stale suggestion and leaks no other company's
   product.
6. No raw translation key or truncated control appears in either language.

Two environment notes for whoever runs this: `jest` requires `--runInBand` here
because worker processes are blocked, and `dist/` is not writable under the
session sandbox, so `npm run build` for the API was validated by emitting to a
writable directory instead.
