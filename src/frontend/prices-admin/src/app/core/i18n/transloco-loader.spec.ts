import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTransloco } from '@jsverse/transloco';
import es419 from '../../../../public/i18n/es-419.json';
import { HttpTranslocoLoader, I18N_ASSET_PATH } from './transloco-loader';
import { LanguageService } from './language.service';
import { DEFAULT_LOCALE, SUPPORTED_LOCALE_IDS } from './supported-locales';
import { jwtInterceptor } from '../interceptors/jwt.interceptor';

/**
 * Integration coverage for the wiring the in-memory testing loader cannot
 * exercise: the real HTTP loader running through the real interceptor chain.
 *
 * This is the exact path that could deadlock on a circular dependency
 * (`jwtInterceptor -> LanguageService -> TranslocoService -> HttpTranslocoLoader
 * -> HttpClient -> jwtInterceptor`), because `LanguageService` starts the
 * catalog request from `initialize()`/`activate()`.
 */
describe('Transloco HTTP loading (real loader + interceptors)', () => {
  let httpMock: HttpTestingController;
  let language: LanguageService;
  let document: Document;

  /**
   * Pins the browser preference so the resolved locale is deterministic: without
   * it the guest resolution would depend on the locale of the host running the
   * tests.
   */
  function stubBrowserLocale(): void {
    Object.defineProperty(window.navigator, 'languages', {
      value: [DEFAULT_LOCALE],
      configurable: true
    });
    Object.defineProperty(window.navigator, 'language', {
      value: DEFAULT_LOCALE,
      configurable: true
    });
  }

  function restoreBrowserLocale(): void {
    delete (window.navigator as unknown as Record<string, unknown>)['languages'];
    delete (window.navigator as unknown as Record<string, unknown>)['language'];
  }

  function build(): void {
    window.localStorage.clear();
    stubBrowserLocale();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        ...provideTransloco({
          config: {
            availableLangs: [...SUPPORTED_LOCALE_IDS],
            defaultLang: DEFAULT_LOCALE,
            fallbackLang: DEFAULT_LOCALE,
            reRenderOnLangChange: true
          },
          loader: HttpTranslocoLoader
        })
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    language = TestBed.inject(LanguageService);
    document = TestBed.inject(DOCUMENT);
  }

  /** Drains microtasks until the predicate holds. */
  async function waitFor(predicate: () => boolean, attempts = 25): Promise<void> {
    for (let i = 0; i < attempts && !predicate(); i += 1) {
      await Promise.resolve();
    }
  }

  beforeEach(() => build());

  afterEach(() => {
    restoreBrowserLocale();
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('bootstraps without a circular dependency and fetches only the active catalog', () => {
    language.initialize();

    const request = httpMock.expectOne(`${I18N_ASSET_PATH}/${DEFAULT_LOCALE}.json`);
    expect(request.request.method).toBe('GET');
    // The interceptor resolved LanguageService while the catalog it is fetching
    // was still in flight, which is the cycle this test guards against.
    expect(request.request.headers.get('Accept-Language')).toBe(DEFAULT_LOCALE);

    // Only the active locale is requested: catalogs are not preloaded.
    httpMock.expectNone(`${I18N_ASSET_PATH}/en-US.json`);

    request.flush(es419);
    httpMock.verify();
  });

  it('applies language, direction and the document title from the fetched catalog', async () => {
    language.initialize();
    httpMock.expectOne(`${I18N_ASSET_PATH}/${DEFAULT_LOCALE}.json`).flush(es419);

    const title = TestBed.inject(Title);
    await waitFor(() => title.getTitle() === es419.app.title);

    expect(title.getTitle()).toBe(es419.app.title);
    expect(document.documentElement.lang).toBe(DEFAULT_LOCALE);
    expect(document.documentElement.dir).toBe('ltr');
    httpMock.verify();
  });

  it('never renders a raw catalog key when the request fails', async () => {
    const title = TestBed.inject(Title);
    const before = title.getTitle();

    language.initialize();
    httpMock
      .expectOne(`${I18N_ASSET_PATH}/${DEFAULT_LOCALE}.json`)
      .flush('nope', { status: 404, statusText: 'Not Found' });

    await waitFor(() => false, 5);

    // The fallback title declared in index.html is preserved.
    expect(title.getTitle()).toBe(before);
    expect(title.getTitle()).not.toContain('app.title');
  });
});
