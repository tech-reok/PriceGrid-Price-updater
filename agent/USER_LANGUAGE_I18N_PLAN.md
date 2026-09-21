# PriceGrid — Per-User Internationalization Plan

> **Working branch:** `codex/user-language-i18n-plan`  
> **Analyzed baseline:** `main` at `7d78c41` (September 20, 2026)  
> **Scope:** Angular administrative UI and the API contract for user language preferences.  
> **Initial locales:** Latin American Spanish (`es-419`) and United States English (`en-US`).

---

## 1. Objective and scope decisions

Add runtime language switching that is persisted per user and remains completely independent from the active tenant. The preference must follow the user through login, token refresh, and session restoration. The design must also allow future languages and new UI copy to be added without redesigning the database or repeating a full application-wide refactor.

### Functional decisions

1. The preference belongs to `users`, not to `tenants`.
2. The only initially accepted values are `es-419` and `en-US`.
3. `es-419` is the default for existing and new users so the migration preserves current behavior.
4. An authenticated user can change their own language without `users:update` and without selecting a tenant. This is required for global administrators.
5. The authenticated shell exposes a dedicated language selector in the top header, immediately to the left of the user-profile control. It is not hidden inside the profile menu.
6. The selector follows the familiar globe-icon pattern shown in the product reference: globe icon, current language label, chevron, and a dropdown containing only English and Latin American Spanish.
7. Administrators with user-management permissions can select the initial language when creating or editing a user.
8. Language changes take effect immediately without a page reload. The new preference is then persisted through the API. If persistence fails, the UI returns to the previous language and displays a localized error.
9. During an authenticated session, the server-side user preference always wins. Before login, the resolution order is: last valid locale cached in the browser, a compatible browser locale, and finally `es-419`.
10. Logout keeps only the last UI locale in browser storage so the login page can be localized. The database remains the source of truth for authenticated users.
11. User-entered business data is not translated: company, product, price-list, marketplace, discount, note, or custom-role names remain exactly as entered. UI copy and system values identified by stable codes or slugs are translated.
12. The initial languages are left-to-right, but locale metadata includes `direction` so a future right-to-left language does not require changing the core contract.

### Out of scope

- Translating previously stored business content.
- Selecting a language per tenant.
- Translating the external integration API.
- Localizing exported files in this phase. Existing export data and headers retain their current contract. A later phase can capture the requester's locale when an export is queued.
- Creating translation tables for editable business catalogs.

---

## 2. Current-state findings

### Backend

- `users` has no language or locale field.
- `AuthUser` is assembled in one place, `AuthService.toAuthUser()`, and is returned by login, refresh, `/auth/me`, and JWT verification. This is the correct propagation point for the preference.
- The user CRUD routes require tenant context and administrative permissions. They cannot safely support self-service preferences or a global administrator without a selected company.
- Zod request schemas are strict. Adding the Prisma column alone is insufficient; the field must be explicitly allowed in create/update schemas and in a dedicated self-service endpoint.
- The error envelope already contains a top-level `code`, but several errors share generic codes and `details[]` contains English prose only. The frontend currently renders `message`, so complete bilingual behavior requires stable, translatable error codes.
- System roles and permissions store English `name` and `description` values. Currencies are seeded with Spanish names. Those values should not be treated as localized UI copy when a stable slug or code is available.

### Frontend

- The Angular 19 standalone application has no translation library.
- `<html lang>` and the document `<title>` are fixed in Spanish.
- User-visible copy is embedded in every feature module, the shell, the login page, shared components, TypeScript configuration arrays, toast messages, placeholders, and accessibility labels.
- `AppDatePipe`, `MoneyPipe`, `formatMoney()`, and the Settings clock hard-code `es-MX`.
- `StatusLabelPipe` contains a private Spanish dictionary.
- `CrudPageComponent` builds phrases through string concatenation and pluralizes by adding `s`; this cannot be translated reliably.
- Columns, fields, select options, actions, and preview results currently receive already-resolved `string` labels. Translating those once during component construction would not react to runtime language changes.
- Session state is memory-only. On a hard reload, `authGuard` restores the user through refresh; that path must also restore the user's locale.
- `src/app/app.component.html` is unused generated content because `AppComponent` has an inline template. It is not part of the real UI and should either be excluded from localization checks or removed as cleanup.

### Translation surface inventory

| Area | Primary files | Content to move to translation keys |
|---|---|---|
| Bootstrap and document | `src/index.html`, `app.config.ts`, `app.component.ts` | document language, direction, title, initialization |
| Session and navigation | `session.store.ts`, `auth.service.ts`, `auth.guard.ts`, `error.interceptor.ts`, `jwt.interceptor.ts`, `shell.component.ts/html`, `language-selector.component.ts` | locale synchronization, navigation, visible header selector, responsive behavior, persistence, accessibility |
| Shared infrastructure | `crud-page.component.ts/html`, `crud-page.types.ts`, `modal.component.ts`, `state-panel.component.ts`, `status-badge.component.ts`, `toast-host.component.ts` | CRUD actions, filters, pagination, states, modals, confirmations, ARIA labels |
| Formatting and errors | `format.ts`, `app-date.pipe.ts`, `money.pipe.ts`, `status-label.pipe.ts`, `options.ts`, `time-zones.ts`, `validation.ts` | dates, money, statuses, errors, options, validation help |
| Access management | `features/auth/login.component.ts`, `users.component.ts`, `roles.component.ts`, `api-keys.component.ts`, `companies.component.ts` | templates, form configuration, toasts, messages |
| Pricing | `products`, `prices`, `price-lists`, `price-history`, `discounts`, `marketplaces`, `price-catalog` | titles, tables, fields, calculations, exports, actions |
| Dashboard and settings | `dashboard.component.ts/html`, `settings.component.ts/html` | metrics, charts, states, time zone, currency table, clock |
| Tests | core, shared, layout, and feature specs | locale fixtures, translated expectations, runtime switching |

The source scan found user-visible copy in at least 23 production frontend files. A screen-by-screen partial migration is therefore not recommended.

---

## 3. Proposed architecture

### 3.1 Runtime translations

Use `@jsverse/transloco` because it supports standalone Angular applications, runtime language switching, fallback handling, and JSON resource loading. Angular's built-in i18n workflow is not the primary choice for this requirement because it generates a separate distributable application variant for each locale, adding separate deployment paths and normally requiring navigation or reload to switch language.

Initial configuration:

```ts
export const SUPPORTED_LOCALES = {
  'es-419': { labelKey: 'language.es419', direction: 'ltr' },
  'en-US': { labelKey: 'language.enUS', direction: 'ltr' }
} as const;

export type SupportedLocale = keyof typeof SUPPORTED_LOCALES;
export const DEFAULT_LOCALE: SupportedLocale = 'es-419';
```

Messages initially live in two root resource files with namespaces:

```text
public/i18n/es-419.json
public/i18n/en-US.json
```

Recommended namespaces: `common`, `language`, `shell`, `auth`, `errors`, `validation`, `status`, `dashboard`, `companies`, `products`, `priceLists`, `marketplaces`, `prices`, `discounts`, `priceHistory`, `priceCatalog`, `apiKeys`, `users`, `roles`, and `settings`.

One file per locale keeps the first migration straightforward. Keys are namespaced from the start so the catalogs can later be divided into lazy-loaded Transloco scopes without renaming the public key contract.

### 3.2 Source of truth and synchronization

Create a `LanguageService` as the only locale facade. Its responsibilities are:

- validate and normalize locale values against `SUPPORTED_LOCALES`;
- expose `activeLocale` as a readonly signal;
- activate the matching Transloco language;
- update `document.documentElement.lang` and `dir`;
- update the document title through Angular's `Title` service;
- read and write only the guest/login fallback in `localStorage`, using a versioned key such as `pricegrid.uiLocale.v1`;
- expose the active locale to formatters and the HTTP interceptor;
- apply the preference received in an `AuthUser`.

`SessionStore.setSession()` and `patchUser()` apply `user.preferredLocale` through this facade. That covers all four current session creation/restoration paths: login, explicit refresh, interceptor refresh, and guard refresh.

Resolution precedence:

```text
authenticated user preference from API
        ↓
valid cached locale for the login screen
        ↓
navigator.languages mapped to a supported locale
        ↓
es-419
```

Browser normalization maps every `es-*` variant to `es-419`, every `en-*` variant to `en-US`, and all other values to `es-419`. The API does not accept loose normalization; writes must contain one of the two canonical codes.

### 3.3 Header language-selector UX

Add a reusable `LanguageSelectorComponent` and render it in the authenticated shell header directly to the left of the user-profile/avatar button. The control remains independent from the profile dropdown so the language choice is discoverable with one click on every authenticated screen.

Desktop presentation:

```text
[ globe icon ]  English  [ chevron ]
                  ┌──────────────────────────────┐
                  │ ✓ English (United States)   │
                  │   Español (Latinoamérica)   │
                  └──────────────────────────────┘
```

Visual and interaction requirements:

- use the existing Lucide icon system and register a `globe-2` or equivalent globe icon in `core/icons.ts`;
- display the short active label (`English` or `Español`) in the trigger on desktop;
- display full self-names in the dropdown: `English (United States)` and `Español (Latinoamérica)`;
- do not use country flags as the primary language identifier because the supported locales represent languages/regions rather than citizenship;
- indicate the active option with a checkmark and selected styling, not color alone;
- align the dropdown to the right edge of the trigger and ensure it layers above the header/content without clipping;
- open and close on click, close on outside click and `Escape`, and return focus to the trigger after closing;
- support `Enter`/`Space`, arrow-key navigation, and selection from the keyboard;
- expose `aria-haspopup="menu"`, `aria-expanded`, an accessible trigger label, and `role="menuitemradio"` plus `aria-checked` for options;
- keep the trigger visible when no tenant is selected and for every role, including global administrators;
- while saving, disable duplicate selection, keep the active option visible, and show a subtle busy state without shifting the header layout;
- apply the locale optimistically; on API failure, restore the previous locale, keep/reopen a usable selector state, and show a localized toast;
- on success, close the menu, update the session user, persist the guest/login cache, and retain focus predictably;
- add stable test hooks such as `language-selector`, `language-selector-trigger`, and `language-option-en-US`/`language-option-es-419`.

Responsive behavior:

- on medium and large screens, show globe + active language + chevron;
- on narrow screens, preserve the globe control but hide the text label before hiding any functional control; expose the current language through the accessible name and tooltip;
- the dropdown must stay inside the viewport and remain large enough for touch targets;
- if header space becomes constrained by the global-admin tenant selector, collapse the language label first and keep both selectors operational.

The component receives the active locale and supported-locale metadata from `LanguageService`; it must not duplicate locale constants. It emits a canonical locale and delegates persistence to the preference service. The same reusable component can later be placed on the login screen without changing persistence or translation logic, but the authenticated header placement is required in this phase.

### 3.4 Static copy versus dynamic data

Strings must not be translated once in each component constructor. To preserve runtime reactivity:

- templates use Transloco directives or pipes;
- declarative CRUD configuration stores `labelKey`, `placeholderKey`, `helpKey`, or `messageKey`, not resolved strings;
- messages with variables translate the complete sentence with parameters;
- API-loaded business data remains literal;
- system values use stable slugs/codes for lookup and fall back to the API value.

Shared types should distinguish translatable copy from dynamic literal text:

```ts
interface TranslatableText {
  key: string;
  params?: Record<string, unknown>;
}

type DisplayText = TranslatableText | { text: string };
```

`ColumnConfig`, `FieldConfig`, `SelectOption`, `RowAction`, and `PreviewResult` use `DisplayText`. Dynamic values such as `product.name` or a custom `role.name` use `{ text }`; static configuration uses `{ key }`.

Patterns such as `New ${entity}` and `${entity}s` must be replaced by complete translated messages. This avoids grammatical gender, plurality, and word-order errors.

### 3.5 Dates, numbers, and currency

Keep the existing application pipes to minimize template churn, but delegate formatting to a `LocaleFormattingService` driven by `LanguageService.activeLocale`.

- `AppDatePipe`: `Intl.DateTimeFormat(activeLocale, ...)`.
- `MoneyPipe` and previews: `Intl.NumberFormat(activeLocale, { style: 'currency', currency })`.
- The Settings clock uses the active locale while preserving the tenant time zone as an independent setting.
- `formatMoney()` stops hard-coding `es-MX`; imperative call sites use the formatting service or pass the locale explicitly.
- Pipes must react to a runtime locale change. Compare a thin impure pipe against explicit signal-driven invalidation and select the approach after measuring table rendering. `LOCALE_ID` alone is insufficient because it is a bootstrap token and does not provide runtime switching by itself.
- `time-zones.ts` may continue using `en-US` internally to obtain a stable `GMT±hh:mm` token, but surrounding labels must be localized. This technical exception should be documented.

### 3.6 Errors and validation

The API should not choose presentation language. It keeps technical/fallback messages and exposes stable codes; the frontend resolves:

```text
errors.<API_CODE> -> localized message with parameters -> API message -> errors.unexpected
```

Required changes:

- expand `ErrorDetail` to `{ field?, code?, message, params? }`;
- assign domain-specific codes where only generic `NOT_FOUND` or `VALIDATION_ERROR` exists today;
- make `zodDetails()` return normalized codes and parameters such as `minimum` and `maximum`;
- replace direct `error?.error?.message` reads with one `ApiErrorLocalizer`;
- retain the technical `field` property so Reactive Forms can bind server errors to controls;
- attach `Accept-Language` in the interceptor for logs and future backend notifications/jobs, even though this phase does not translate server responses.

Logs and internal exceptions do not need translation. The requirement is that a known technical message never reaches the user when a localized code exists.

### 3.7 System catalogs

- Statuses such as `active`, `inactive`, `revoked`, and `expired`: translate by code.
- Roles with `isSystem=true`: translate name and description by `role.slug`; custom roles retain database text.
- Permissions: translate by `permission.slug`; keep `name/description` as a fallback.
- Currencies: show the code and obtain a localized name through `Intl.DisplayNames` when available; use `currencies.MXN/USD` keys or the API name as fallback.
- History reasons, API scopes, discount types/scopes, marketplace codes, and actor types: translate their enum/code when displayed.

---

## 4. Data and API contract

### 4.1 Database

Modify `prisma/schema.prisma`:

```prisma
model User {
  // ...
  preferredLocale String @default("es-419") @map("preferred_locale") @db.VarChar(16)
}
```

Use `VARCHAR`, not a MySQL/Prisma enum, so adding another supported locale does not require a schema migration. The application validation layer owns the allowlist.

Create an additive migration:

```sql
ALTER TABLE `users`
  ADD COLUMN `preferred_locale` VARCHAR(16) NOT NULL DEFAULT 'es-419';
```

No separate backfill is required: the default covers existing rows and protects future inserts. Document the manual rollback (`DROP COLUMN`) but do not execute destructive rollback automatically.

### 4.2 Authentication responses

Add `preferredLocale` to backend and frontend `AuthUser`:

```json
{
  "id": "...",
  "email": "user@example.com",
  "preferredLocale": "es-419",
  "permissions": []
}
```

Login, refresh, and `/auth/me` receive it automatically from `toAuthUser()`. It does not belong in the JWT payload: language is not authorization data, and the middleware already reloads the user record during token verification.

### 4.3 Self-service preferences

Add:

```http
PATCH /api/v1/auth/me/preferences
Authorization: Bearer <token>
Content-Type: application/json

{ "preferredLocale": "en-US" }
```

Return `200` with the updated `AuthUser`. The strict request body accepts only `preferredLocale` in this phase.

Rules:

- modify only `req.user.id`;
- do not accept a user ID from the client;
- do not require `X-Tenant-Id`;
- do not require additional RBAC permissions;
- write `updatedBy` as the same user;
- reject every value outside the allowlist with `422` and a stable validation-detail code.

### 4.4 Administrative user CRUD

`createUserSchema` and `updateUserSchema` accept `preferredLocale`. Create treats it as optional and defaults to `es-419`; update keeps it optional. The Users screen adds a “Preferred language” select.

Seeds may set the locale explicitly so their intent remains documented, even though the database default protects all records.

---

## 5. File-level change plan

### Backend — production changes

- `prisma/schema.prisma`: add `User.preferredLocale`.
- `prisma/migrations/<timestamp>_add_user_preferred_locale/migration.sql`: additive database migration.
- `src/common/i18n/supported-locales.ts` (new): backend allowlist, type, and default.
- `src/types/index.ts`: add the field to `AuthUser`; type error detail `code/params`.
- `src/repositories/auth.repository.ts`: add the field to `UserWithRole` and add an update-by-user-id method.
- `src/services/auth.service.ts`: map the locale and update self-service preferences.
- `src/controllers/auth.controller.ts`: add `updatePreferences`.
- `src/routes/auth.routes.ts`: expose the authenticated route.
- `src/validators/access.validators.ts`: add the preference schema and allow the field in create/update user.
- `src/services/user.service.ts`: preserve and defensively validate the preference in administrative creates/updates.
- `src/common/errors/index.ts`, `src/middlewares/validate.ts`, `src/middlewares/error-handler.ts`, and services that throw known errors: add localizable codes/parameters.
- `prisma/seed/data.ts` and `prisma/seed/demo/users.ts`: make initial-account locale intent explicit.

### Frontend — new infrastructure

- `package.json` and `package-lock.json`: add `@jsverse/transloco`; add `@jsverse/transloco-locale` only if it replaces custom code without creating a second locale source of truth.
- `public/i18n/es-419.json` and `public/i18n/en-US.json`: complete, key-compatible catalogs.
- `src/app/core/i18n/supported-locales.ts`: frontend locale metadata.
- `src/app/core/i18n/transloco-loader.ts`: HTTP resource loader.
- `src/app/core/i18n/language.service.ts`: selection, precedence, DOM state, browser cache, and active-locale signal.
- `src/app/core/i18n/locale-formatting.service.ts`: date, money, number, and display-name formatting.
- `src/app/core/i18n/api-error-localizer.service.ts`: top-level API and field-detail localization.
- `src/app/core/services/user-preferences.service.ts`: self-service PATCH request.
- `src/app/app.config.ts`: Transloco providers and initialization.
- `src/app/app.component.ts`: initialize the language coordinator once.

### Frontend — session and contract changes

- `src/app/core/models/index.ts`: add `preferredLocale` to `AuthUser` and `User`; add `code/params` to error details.
- `src/app/core/services/session.store.ts`: synchronize locale in `setSession` and `patchUser`.
- `src/app/core/services/auth.service.ts`, `core/guards/auth.guard.ts`, and `core/interceptors/error.interceptor.ts`: verify every session path goes through `SessionStore`.
- `src/app/core/interceptors/jwt.interceptor.ts`: attach `Accept-Language` while preserving existing headers.
- `src/app/core/icons.ts`: register the globe and check icons used by the selector through the existing Lucide icon registry.
- `src/app/shared/language-selector.component.ts` (new): reusable globe trigger, current-language label, accessible dropdown, responsive layout, busy state, and canonical-locale selection events.
- `src/app/layout/shell.component.ts/html`: use navigation keys and place the language selector directly in the right side of the header, immediately before the user-profile control; wire optimistic persistence and rollback without hiding the selector inside the profile menu.
- `src/index.html`: set fallback `lang="es-419"` and a fallback title; runtime state is controlled by the service.

### Frontend — shared components

- `src/app/shared/crud-page.types.ts`: add `DisplayText` for labels, help, placeholders, actions, and previews.
- `src/app/shared/crud-page.component.ts/html`: translate keys during rendering; remove concatenation/pluralization; localize filters, states, pagination, buttons, and confirmation dialogs.
- `src/app/shared/modal.component.ts`: localize the close ARIA label.
- `src/app/shared/state-panel.component.ts`: localize loading, empty, error, and retry states.
- `src/app/core/pipes/status-label.pipe.ts`: translate by status code.
- `src/app/core/pipes/app-date.pipe.ts` and `money.pipe.ts`: use the dynamic locale.
- `src/app/core/utils/format.ts`: remove `es-MX`, centralize error localization, and avoid static global formatting.
- `src/app/core/utils/options.ts`: support translation-key and literal options.
- `src/app/core/utils/time-zones.ts`: document the stable GMT-token exception and localize surrounding copy.

### Frontend — feature modules

Migrate all static copy and declarative configuration from:

- `features/auth/login.component.ts`
- `features/dashboard/dashboard.component.ts/html`
- `features/companies/companies.component.ts`
- `features/products/products.component.ts`
- `features/price-lists/price-lists.component.ts`
- `features/marketplaces/marketplaces.component.ts`
- `features/prices/prices.component.ts`
- `features/discounts/discounts.component.ts`
- `features/price-history/price-history.component.ts`
- `features/price-catalog/price-catalog.component.ts`
- `features/api-keys/api-keys.component.ts`
- `features/users/users.component.ts`
- `features/roles/roles.component.ts`
- `features/settings/settings.component.ts/html`

`users.component.ts` receives the administrative preferred-language select. Do not place the user preference inside the current Settings feature: that screen represents tenant settings and is protected by `tenantGuard`; mixing the concepts would violate the requirement and block global administrators without a selected tenant.

---

## 6. Recommended implementation sequence

### Phase 1 — persistent contract

1. Add locale constants, Prisma field, and migration.
2. Update repository, types, schemas, service, and authentication responses.
3. Add the self-service preferences endpoint.
4. Add backend unit tests and run Prisma generation, TypeScript build, and Jest coverage.

**Verifiable output:** login, refresh, and me always return a canonical locale, and a user can modify only their own preference.

### Phase 2 — frontend infrastructure

1. Install/configure Transloco and add both base catalogs.
2. Implement `LanguageService`, formatters, and the API error localizer.
3. Synchronize `SessionStore`, document metadata, title, and interceptor.
4. Add the reusable globe language selector to the shell header and add the Users CRUD field.

**Verifiable output:** changing language persists, survives refresh/hard reload, and remains unchanged when a global administrator switches tenant.

### Phase 3 — shared UI first

1. Migrate `DisplayText` and `CrudPageComponent`.
2. Migrate modal, state panel, badges, pipes, utilities, and toast sources.
3. Rewrite concatenated phrases as complete translation messages.

**Verifiable output:** all CRUD features inherit translated buttons, pagination, states, and forms without duplicating localization logic.

### Phase 4 — features and final inventory

1. Migrate shell and login.
2. Migrate every feature listed in Section 5.
3. Translate system enums/catalogs through slugs and codes.
4. Run a final visible-string scan, including ARIA labels, placeholders, tooltips, titles, and empty states.

**Verifiable output:** no embedded Spanish UI copy remains in production source outside documented fallbacks or a reviewed whitelist.

### Phase 5 — quality and documentation

1. Complete all unit tests in Section 7.
2. Add automatic JSON key-parity and empty-value tests.
3. Run production builds and full backend/frontend suites with coverage.
4. Update README with contributor rules for adding a language or translation key.
5. Perform manual QA for English text width, responsive layouts, navigation, dialogs, tables, and accessibility.

---

## 7. Unit-testing plan

Unit tests are part of the implementation, not a follow-up task. Every production behavior introduced by this feature must be covered at the service/component boundary, while HTTP/database dependencies remain mocked with the repository's existing fake Prisma, Jasmine spies, `HttpTestingController`, and Angular `TestBed`.

Existing repository thresholds remain mandatory:

- Backend Jest: at least 70% for statements, branches, functions, and lines.
- Frontend Jasmine/Karma: at least 60% for statements, branches, functions, and lines.
- The new i18n services and preference endpoint should target 90%+ line and branch coverage because they are small, security-relevant, and contain precedence/fallback logic.

### 7.1 Backend unit-test matrix

| Target spec | Unit under test | Required cases |
|---|---|---|
| `tests/unit/validators.spec.ts` | `preferredLocaleSchema` and request schemas | accepts exactly `es-419` and `en-US`; rejects `es`, `en`, wrong case, unsupported locale, empty/null, and extra body fields; create defaults correctly; update remains optional |
| `tests/unit/auth.repository.spec.ts` | `PrismaAuthRepository` | reads `preferredLocale`; updates only the requested user; writes audit fields; returns the updated row; missing user behavior is deterministic |
| `tests/unit/auth.service.spec.ts` | `AuthService.toAuthUser` and preference update | login, refresh, me, and JWT verification expose locale; preference update returns a full `AuthUser`; inactive/missing user fails; unsupported values cannot bypass validation/defense-in-depth |
| `tests/unit/services.spec.ts` | `UserService` administrative create/update | omitted locale uses `es-419`; both supported locales persist; unrelated updates keep current locale; password sanitization remains intact; users cannot cross tenant boundaries |
| `tests/unit/controllers.spec.ts` | `AuthController.updatePreferences` | reads authenticated user ID instead of request body/params; passes actor context; returns 200/plain response; unauthenticated request is rejected |
| `tests/unit/app.spec.ts` | Express route wiring | PATCH succeeds for tenant user and global admin without `X-Tenant-Id`; rejects missing JWT; rejects unsupported locale and unknown fields; cannot target another user; follow-up `/auth/me` returns the saved value |
| `tests/unit/middlewares.spec.ts` | validation/error envelope | Zod detail exposes stable `code` and `params`; error envelope preserves trace ID; fallback message remains present for non-UI consumers |
| `tests/unit/seeds.spec.ts` | demo/base user seeds | seeded users receive explicit/default `es-419`; rerunning seeds remains idempotent |

Additional backend assertions:

- Verify `preferredLocale` is never added to the JWT payload.
- Verify changing locale does not revoke or rotate refresh tokens.
- Verify preference writes do not require tenant context or `users:update`.
- Verify generic administrative `PATCH /users/:id` still requires its existing tenant and permission guards.
- Verify `sanitize()` never exposes `passwordHash` after locale changes.
- Add locale data to the shared user fixture builders so existing auth tests fail at compile time if the contract is incomplete.

The migration is verified through Prisma/schema checks rather than mocked as a unit:

- `npx prisma validate`
- `npm run prisma:generate`
- apply the migration to the disposable test/development database when integration infrastructure is available;
- assert the SQL is additive and defaults existing rows to `es-419`.

### 7.2 Frontend unit-test matrix

| Target spec | Unit under test | Required cases |
|---|---|---|
| `core/i18n/supported-locales.spec.ts` | locale helpers | exact support checks; `es-*` and `en-*` browser normalization; unknown/null values fall back to `es-419`; metadata exposes direction |
| `core/i18n/language.service.spec.ts` | `LanguageService` | precedence among authenticated value/cache/browser/default; invalid cache ignored; active locale updates Transloco, signal, localStorage, `html.lang`, `html.dir`, and title; switching twice is idempotent |
| `core/i18n/locale-formatting.service.spec.ts` | formatters | Spanish and English date output; number separators change; MXN/USD currency preserved; invalid date/value fallback; timezone and locale remain independent; `Intl.DisplayNames` fallback path |
| `core/i18n/api-error-localizer.service.spec.ts` | API error mapping | known top-level code; interpolated params; field detail code; unknown code falls back to API message; empty/unsafe message falls back to localized unexpected error |
| `core/services/user-preferences.service.spec.ts` | preference API client | correct PATCH URL/body; credentials/interceptors unaffected; success type; 422 and network error propagation |
| `core/services/session.store.spec.ts` | session-to-locale synchronization | setSession applies user locale; patchUser switches locale; tenant selection does not; clear keeps guest locale but clears auth data |
| `core/interceptors/interceptors.spec.ts` | JWT/error interceptors | sends canonical `Accept-Language`; retains Authorization and tenant headers; refreshed user preference is applied; failed refresh still clears session |
| `core/guards/guards.spec.ts` | hard-reload restoration | refresh response applies locale before protected screen renders; failed refresh leaves guest locale and redirects |
| `core/pipes/pipes.spec.ts` | date, money, status pipes | both locales render expected values; runtime switch invalidates output; status uses translation key; null/invalid values return em dash |
| `shared/crud-page.component.spec.ts` | translation-aware CRUD renderer | title/columns/fields/actions translate in both locales; runtime switch rerenders; full-sentence create/edit/delete messages; dynamic API labels remain unchanged; server field error is localized |
| `shared/language-selector.component.spec.ts` | globe language selector | trigger shows globe/current language/chevron; dropdown contains exactly two options; active option has checkmark and `aria-checked`; click and keyboard selection emit canonical locale; outside click and Escape close; focus returns to trigger; busy state prevents duplicate selection; mobile mode retains an accessible name |
| `shared/components.spec.ts` | modal/state/status/toast UI | close/retry/empty/loading/error ARIA and text in both locales; dynamic toast message preserved; status badge switches language |
| `layout/shell.component.spec.ts` | selector placement, persistence, and navigation | selector renders in the header outside the profile menu for every role and without a selected tenant; selected value matches user; successful change persists and updates session; failed change rolls back and shows localized toast; tenant switching does not change locale; narrow layout keeps the globe control available |
| `features/features.spec.ts` | representative feature rendering | login, dashboard, settings, Users, Roles, and one generic CRUD feature render translated headings and controls in both locales |
| `features/feature-logic.spec.ts` | feature actions/toasts/config | price preview labels, exports, access management, role permissions, and settings success/error messages use keys and react to locale |
| `core/i18n/translation-catalog.spec.ts` | JSON catalogs | recursively identical key sets; no empty/null values; supported locales have files; interpolation placeholders match between languages; no accidental HTML unless explicitly allowed |

### 7.3 Test doubles and fixtures

- Provide a `createAuthUser(overrides)` fixture with `preferredLocale: 'es-419'` as the default.
- Use an in-memory Transloco testing loader containing small English and Spanish catalogs; unit tests must not perform real asset requests.
- Mock `navigator.languages`, `localStorage`, `Title`, and `DOCUMENT` explicitly and reset them after each test to prevent cross-test leakage.
- Freeze time for date-formatting and Settings-clock tests.
- Do not assert full browser-dependent `Intl` sentences when punctuation can vary by runtime. Assert stable parts or compare against `Intl` called with the expected locale.
- Use `HttpTestingController` for the preferences service and existing refresh flows.
- Keep selectors based on `data-testid` or accessible roles rather than translated text whenever the test is about behavior, not copy.

### 7.4 Regression tests for existing behavior

The feature must not weaken these existing guarantees:

- tenant isolation and global-admin tenant selection;
- JWT refresh single-flight behavior;
- permission guards;
- password hashing and sanitization;
- CRUD create/edit/delete flows;
- price/date business logic and tenant time zone behavior;
- export polling/download behavior;
- existing coverage thresholds.

Existing tests that assert Spanish strings should be converted as follows:

- behavior-focused test: query by test ID/role and avoid locale-specific text;
- localization-focused test: explicitly activate a locale and assert its expected translation;
- dynamic-business-data test: continue asserting the literal API value.

### 7.5 Commands required before completion

Backend:

```powershell
cd src/backend/prices-api
npm run prisma:generate
npm run build
npm run test:cov -- --runInBand
```

Frontend:

```powershell
cd src/frontend/prices-admin
npm run build
npm run test:coverage
```

Completion requires both command groups to pass. A test cannot be disabled, focused with `fit/fdescribe`, or replaced by a snapshot that hides missing translations.

---

## 8. Integration checks and manual acceptance

### Automated contract/integration checks

- Login, refresh, and me return the same canonical locale.
- The self-service PATCH changes only the authenticated user.
- Hard reload restores the user locale before feature content becomes interactive.
- A global administrator can update language without a selected tenant.
- Switching tenant never changes language.
- An unsupported locale receives a stable 422 validation response.
- Translation assets are served in production builds and cache-busted with the application deployment.

### Manual QA

1. Open login with no cache and a Spanish browser: Spanish is shown.
2. Open login with no cache and an English browser: English is shown. If product requirements later choose an unconditional Spanish login default, only this guest-resolution rule changes.
3. Sign in as a user configured in the opposite language from the login page: the entire application switches to the stored user preference.
4. Change language from the globe selector in the header and navigate every module without reloading.
5. Reload, log out, and log back in; verify precedence at every step.
6. Force an API error, field validation error, and preference-save failure.
7. Review dashboard, CRUD pages, dialogs, exports, permissions, settings, and loading/empty/error states.
8. Verify `<html lang>`, `dir`, title, keyboard behavior, and ARIA labels with accessibility tooling.
9. Inspect the globe selector and long English labels at mobile, tablet, and desktop widths; confirm the dropdown stays inside the viewport and does not overlap the tenant or profile controls.
10. Operate the selector entirely with the keyboard and verify focus return, active-option announcement, Escape behavior, and busy state.
11. Confirm two users in the same tenant can keep different languages.

### Definition of Done

- The preference is persisted per user and never per tenant.
- Only `es-419` and `en-US` are accepted.
- Runtime switching and persistence work without reload.
- A visible globe language selector is available in the authenticated header for every role, with exactly English and Latin American Spanish as options.
- The selector remains usable on mobile, is fully keyboard accessible, and rolls back cleanly when persistence fails.
- All visible shell, shared, and feature copy resides in translation catalogs.
- Regional date/number/currency formats change dynamically.
- Known errors are localized by stable code.
- Translation-key parity is tested automatically.
- All unit tests in Section 7 are implemented and passing.
- Backend and frontend builds and coverage suites pass their configured thresholds.
- README explains how to add a key and a third locale.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Templates are translated but TypeScript labels/toasts are missed | File inventory, `DisplayText`, and final visible-string scan |
| Spanish flashes before session restoration | Load valid guest cache at bootstrap; server preference corrects authenticated state |
| Configuration arrays do not react to switching | Store keys and translate during render instead of resolving strings during construction |
| Language becomes coupled to tenant time zone | Separate services/endpoints; locale belongs to User, time zone belongs to Tenant |
| English API prose leaks into UI | Translate stable codes and enrich details with code/params |
| Roles, permissions, or currency names remain fixed-language | Resolve system catalogs by slug/code and retain API value only as fallback |
| Adding a language requires a DB migration | Use `VARCHAR` plus allowlist, not a database enum |
| Missing keys reach production | Catalog parity/empty-value unit test and strict missing-key behavior in CI |
| Translation assets increase initial bundle | Load only the active locale JSON; introduce lazy scopes if catalogs grow |
| Tests become brittle because text changes by locale | Separate behavioral selectors from explicit localization assertions |

---

## 10. Rules for future modifications

To add new UI copy:

1. Create a semantic key under the feature namespace.
2. Add it to both catalogs in the same change.
3. Use the key in templates/configuration; do not embed visible text directly.
4. Translate complete sentences with variables instead of concatenating fragments.
5. Translate API values only when they are system enums/codes, never user-entered data.
6. Add or update a unit test when the new key affects behavior, validation, formatting, or accessibility.

To add a third locale:

1. Add its BCP 47 code and metadata to backend and frontend `SUPPORTED_LOCALES`.
2. Create a JSON file containing every required key; the parity test reports omissions.
3. Register locale data only if a selected formatting API requires it.
4. Add selector and browser-normalization coverage.
5. Add formatting and representative component tests for the locale.
6. No database migration is required.

---

## 11. Technical references

- Angular locale variants and deployment model: <https://angular.dev/guide/i18n/merge>
- Transloco standalone/runtime setup: <https://jsverse.gitbook.io/transloco/getting-started/installation>
- Transloco language switching API: <https://jsverse.gitbook.io/transloco/core-concepts/language-api>
- Locale-aware date, number, and currency formatting: <https://jsverse.gitbook.io/transloco/plugins-and-extensions/locale-l10n>
