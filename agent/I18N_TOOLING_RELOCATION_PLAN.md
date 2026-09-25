# Frontend i18n Tooling Relocation and Historical Artifact Cleanup Plan

## Objective

Make the frontend localization tooling self-contained inside the Angular
application directory while removing obsolete migration artifacts from
`agent/i18n`.

The final structure must preserve the two active quality checks used by the
frontend package, keep runtime translation catalogs in their existing location,
and remove all historical fragments and unused generators.

## Confirmed Decision

The following is the agreed target state:

```text
src/frontend/prices-admin/
  src/app/core/i18n/catalogs/       # Runtime translation catalogs; unchanged
    es-419.json
    en-US.json
  tools/i18n/                       # Development/CI validation tooling
    check-keys.mjs
    scan-visible-copy.mjs

agent/i18n/                         # Removed entirely
```

The `agent/i18n` directory must not remain as an alternate source of truth.
There will be one canonical location for shipped UI translations and one local
location for frontend tooling.

## Scope

### In scope

- Move the two active i18n quality scripts into the frontend project.
- Update package commands and documentation to use the new paths.
- Remove historical JSON fragments that duplicate the active catalogs.
- Remove unused one-off scripts that are not invoked by the application,
  package commands, tests, or CI.
- Verify that frontend i18n checks, tests, and production build remain green.

### Out of scope

- Changing runtime language selection, Transloco configuration, locale
  metadata, or the backend preferred-locale contract.
- Moving, renaming, flattening, or regenerating the live locale catalogs.
- Adding a third locale.
- Rewriting the content of translations.
- Replacing the existing validation scripts with a third-party tool.

## Current-State Analysis

### Runtime catalogs are already in the correct frontend location

The frontend loads translations through a dynamic import in:

```text
src/frontend/prices-admin/src/app/core/i18n/transloco-loader.ts
```

The loader imports:

```text
./catalogs/${lang}.json
```

Therefore, the runtime source of truth is:

```text
src/frontend/prices-admin/src/app/core/i18n/catalogs/es-419.json
src/frontend/prices-admin/src/app/core/i18n/catalogs/en-US.json
```

Those files are bundled by Angular as lazily loaded, content-hashed chunks.
They are not read from `agent/i18n`, and they must remain where they are.

### Active tooling currently stored outside the frontend

The following package commands are active in
`src/frontend/prices-admin/package.json`:

```json
"i18n:scan": "node ../../../agent/i18n/scan-visible-copy.mjs",
"i18n:keys": "node ../../../agent/i18n/check-keys.mjs",
"i18n:check": "npm run i18n:scan && npm run i18n:keys"
```

They invoke two scripts in `agent/i18n`:

| Script | Current role | Keep? |
| --- | --- | --- |
| `scan-visible-copy.mjs` | Fails when production Angular source contains embedded user-visible Spanish copy instead of a catalog key. | Yes; move. |
| `check-keys.mjs` | Extracts translation-key references from frontend production code and verifies that every key exists in both catalogs. | Yes; move. |

These scripts are active quality gates, not historical localization data. They
should be preserved, but colocated with the frontend package that owns and
executes them.

### Historical and unused artifacts

The remaining files are not used by runtime code, package scripts, tests, or
the documented build workflow:

| Artifact | Status | Action |
| --- | --- | --- |
| `p4-features.en.json`, `p4-features.es.json` | Historical migration fragments. Their 201 leaf values per locale exactly match the live catalogs. | Delete. |
| `p4-permissions.en-US.json`, `p4-permissions.es-419.json` | Historical migration fragments. Their 112 leaf values per locale exactly match the live catalogs. | Delete. |
| `p4-screens.en.json`, `p4-screens.es.json` | Historical migration fragments. Their 81 leaf values per locale exactly match the live catalogs. | Delete. |
| `merge.mjs` | Manual fragment merger. No npm script, CI job, or runtime code invokes it. Its only practical inputs are the historical fragments being removed. | Delete. |
| `gen-permissions.mjs` | One-off fragment generator. It is not invoked by npm/CI and duplicates a permission table rather than importing a canonical backend source. | Delete. |

The historical files must be deleted rather than moved. Moving them into the
frontend would preserve duplicate translations, introduce confusion about the
source of truth, and create unnecessary maintenance work.

## Target Design

### Separation of concerns

| Concern | Canonical location | Included in production bundle? |
| --- | --- | --- |
| Runtime translations | `src/app/core/i18n/catalogs/` | Yes, lazily by active locale. |
| Runtime loader/services/pipes | `src/app/core/i18n/` | Yes. |
| Frontend i18n quality tooling | `tools/i18n/` | No. It is executed by Node only. |
| Architecture/feature plans | `agent/` | No. Documentation only. |

The Node scripts must live in `tools/i18n/`, not under `src/app/`. `src/app/`
is application source and should contain only browser-side Angular code and
assets that participate in the build graph.

### Script path strategy

After moving the scripts, each must calculate its paths from its own module
location rather than from the terminal's current working directory.

For a script at:

```text
src/frontend/prices-admin/tools/i18n/<script>.mjs
```

the frontend root is two parent directories above the script:

```text
src/frontend/prices-admin
```

Use `fileURLToPath(import.meta.url)`, `dirname`, and `join` to derive:

```text
FRONTEND_ROOT = <script directory>/../..
APP_ROOT      = FRONTEND_ROOT/src/app
CATALOG_ROOT  = APP_ROOT/core/i18n/catalogs
```

This ensures `npm run i18n:check` works whether it is launched from the
frontend directory, repository root, a CI runner, or an IDE task.

### Package-command target

Update the frontend package scripts to:

```json
"i18n:scan": "node tools/i18n/scan-visible-copy.mjs",
"i18n:keys": "node tools/i18n/check-keys.mjs",
"i18n:check": "npm run i18n:scan && npm run i18n:keys"
```

`i18n:check` remains unchanged semantically: it first scans visible copy, then
checks referenced keys. The only change is path ownership.

## Detailed Implementation Plan

### Phase 1 — Establish a clean baseline

1. Confirm the working tree does not contain unreviewed modifications to
   `agent/i18n`, the frontend package manifest, or runtime catalogs.
2. Run from `src/frontend/prices-admin`:

   ```bash
   npm run i18n:check
   npm test
   npm run build
   ```

3. Record that the baseline passes before moving files. This distinguishes a
   migration regression from a pre-existing failure.

### Phase 2 — Move active validation scripts

1. Create the directory:

   ```text
   src/frontend/prices-admin/tools/i18n/
   ```

2. Use Git-aware moves to preserve history:

   ```text
   agent/i18n/check-keys.mjs
   → src/frontend/prices-admin/tools/i18n/check-keys.mjs

   agent/i18n/scan-visible-copy.mjs
   → src/frontend/prices-admin/tools/i18n/scan-visible-copy.mjs
   ```

3. In each moved script, replace the old repository-root calculation with the
   frontend-root calculation described in the target design.
4. Update all path constants:

   - `check-keys.mjs` must scan `FRONTEND_ROOT/src/app` and read catalogs from
     `FRONTEND_ROOT/src/app/core/i18n/catalogs`.
   - `scan-visible-copy.mjs` must scan `FRONTEND_ROOT/src/app`.
5. Preserve script behavior, exit codes, skip patterns, dynamic-key handling,
   output text, and validation rules. This is a relocation, not a functional
   rewrite.

### Phase 3 — Rewire the frontend package

1. Update `src/frontend/prices-admin/package.json` as follows:

   ```diff
   - "i18n:scan": "node ../../../agent/i18n/scan-visible-copy.mjs",
   - "i18n:keys": "node ../../../agent/i18n/check-keys.mjs",
   + "i18n:scan": "node tools/i18n/scan-visible-copy.mjs",
   + "i18n:keys": "node tools/i18n/check-keys.mjs",
   ```

2. Do not change the package lockfile: moving internal scripts changes neither
   dependencies nor package metadata that affects lock resolution.
3. Run each script individually and then `npm run i18n:check` to verify both
   command paths and chained exit-code behavior.

### Phase 4 — Remove obsolete artifacts

Delete the following files after the active checks have passed from their new
location:

```text
agent/i18n/p4-features.en.json
agent/i18n/p4-features.es.json
agent/i18n/p4-permissions.en-US.json
agent/i18n/p4-permissions.es-419.json
agent/i18n/p4-screens.en.json
agent/i18n/p4-screens.es.json
agent/i18n/merge.mjs
agent/i18n/gen-permissions.mjs
```

Then remove the now-empty `agent/i18n/` directory.

No catalog is to be copied into `tools/`; the live catalogs remain only under
`src/app/core/i18n/catalogs/`.

### Phase 5 — Update documentation and references

1. In `README.md`, update the section that currently says the i18n guards live
   in `agent/i18n/`. It must instead point to:

   ```text
   src/frontend/prices-admin/tools/i18n/
   ```

2. Update script headers/comments so their usage path is accurate, for example:

   ```text
   node tools/i18n/check-keys.mjs
   node tools/i18n/scan-visible-copy.mjs [--verbose]
   ```

3. Search the complete repository for `agent/i18n`, `p4-features`,
   `p4-permissions`, `p4-screens`, `merge.mjs`, and `gen-permissions.mjs`.
   Remove or correct every stale operational reference.
4. References inside historical git commits or intentionally archival planning
   documents do not need editing. Documentation describing the current workflow
   does need updating.

### Phase 6 — Regression verification

Run from `src/frontend/prices-admin`:

```bash
npm run i18n:scan
npm run i18n:keys
npm run i18n:check
npm test
npm run build
```

Then verify from repository root, using the package's working directory, that
the commands still resolve correctly. Finally run a repository search to
confirm no active manifest, build script, CI configuration, or documentation
points to `agent/i18n`.

## Files Expected to Change

| File or directory | Change |
| --- | --- |
| `src/frontend/prices-admin/tools/i18n/check-keys.mjs` | New location; update only root/path resolution and usage header. |
| `src/frontend/prices-admin/tools/i18n/scan-visible-copy.mjs` | New location; update only root/path resolution and usage header. |
| `src/frontend/prices-admin/package.json` | Point `i18n:scan` and `i18n:keys` at local tooling. |
| `README.md` | Document the frontend-local i18n tooling path. |
| `agent/i18n/` | Delete all remaining historical files and remove directory. |

### Files intentionally unchanged

| File or directory | Reason |
| --- | --- |
| `src/frontend/prices-admin/src/app/core/i18n/catalogs/*.json` | They are the only runtime translation source of truth. |
| `src/frontend/prices-admin/src/app/core/i18n/transloco-loader.ts` | It already imports catalogs from the correct frontend location. |
| `src/frontend/prices-admin/src/app/core/i18n/translation-catalog.spec.ts` | It already validates the runtime catalogs in their correct location. |
| `src/backend/prices-api/src/common/i18n/` | It owns backend locale validation and is outside this relocation. |

## Test and Validation Matrix

| Validation | Expected result |
| --- | --- |
| `npm run i18n:scan` | Scans production frontend files and reports no embedded visible Spanish copy. |
| `npm run i18n:keys` | Confirms every referenced key exists in both `es-419` and `en-US` catalogs. |
| `npm run i18n:check` | Runs both validations in sequence from the new local path. |
| `npm test` | Catalog parity, interpolation, loader, and UI tests remain green. |
| `npm run build` | Angular compiles the app and preserves dynamic catalog chunks. |
| Repository search | No live path references remain to `agent/i18n` or deleted `p4-*` files. |
| Manual locale switch | Spanish and English still load successfully from `src/app/core/i18n/catalogs`. |

## Acceptance Criteria

- `agent/i18n` no longer exists in the working tree.
- No `p4-*.json` fragment remains anywhere in the active project tree.
- No unused `merge.mjs` or `gen-permissions.mjs` remains.
- The only retained Node i18n scripts are under
  `src/frontend/prices-admin/tools/i18n/`.
- `package.json` no longer traverses to `../../../agent` for i18n commands.
- Runtime locale JSON files remain under `src/app/core/i18n/catalogs/` and are
  still dynamically loaded by the existing Transloco loader.
- The complete frontend i18n check, unit tests, and production build pass.
- Current documentation describes the new ownership and contains no stale
  operational instruction to use `agent/i18n`.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Moving scripts breaks path resolution | Derive paths from `import.meta.url`, not `process.cwd()`, and run scripts from more than one shell location. |
| A deleted fragment was an implicit source for a future manual merge | Repository search confirms no consumer; the live catalogs already contain every fragment value exactly. |
| Runtime catalogs are mistakenly moved into `tools/` | Treat `src/app/core/i18n/catalogs/` as explicitly unchanged and verify the dynamic loader after the cleanup. |
| Quality checks are accidentally removed with historical tooling | Preserve and rewire `check-keys.mjs` and `scan-visible-copy.mjs` before deleting `agent/i18n`. |
| Stale documentation teaches the old path | Include README/reference search as a required verification phase. |

## Definition of Done

The frontend package owns the two i18n quality scripts under `tools/i18n`, the
runtime catalogs remain in `src/app/core/i18n/catalogs`, all historical
`agent/i18n` artifacts are removed, all active path references are updated, and
the full frontend validation suite passes.
