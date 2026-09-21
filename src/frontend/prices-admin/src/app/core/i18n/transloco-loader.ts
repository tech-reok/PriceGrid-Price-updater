import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';
import type { Observable } from 'rxjs';

/** Folder inside `public/` that holds the catalogs, served from the app root. */
export const I18N_ASSET_PATH = 'i18n';

/**
 * Loads the catalogs from `public/i18n/<locale>.json`.
 *
 * The URL is intentionally relative: the browser resolves it against
 * `<base href>`, so the assets are found regardless of the active route (an
 * absolute-looking `/i18n/...` would break a sub-path deployment, and a
 * relative path resolved against the route would break nested routes).
 *
 * Only the active locale is fetched, so adding catalogs does not grow the
 * initial bundle.
 *
 * NOTE: the catalogs are application content with a **stable** file name, so the
 * origin must revalidate them (`Cache-Control: no-cache`) instead of caching them
 * for a long time. See the i18n section of the README.
 */
@Injectable({ providedIn: 'root' })
export class HttpTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`${I18N_ASSET_PATH}/${lang}.json`);
  }
}
