import { map } from 'rxjs/operators';
import type { CrudResource } from '../services/crud-resource';
import type { OptionLoader } from '../../shared/crud-page.types';
import type { Currency } from '../models';

/** Builds a `<select>` option loader returning record ids as values. */
export function idOptionLoader(service: CrudResource<any>, labelKey = 'name'): OptionLoader {
  return () =>
    service.list({ limit: 100 }).pipe(
      map((response) =>
        response.data.map((item: any) => ({
          value: String(item.id),
          label: String(item[labelKey] ?? item.id)
        }))
      )
    );
}

/** Currency options are keyed by ISO code (what the API expects). */
export function currencyOptionLoader(service: CrudResource<Currency>): OptionLoader {
  return () =>
    service.list({ limit: 100 }).pipe(
      map((response) =>
        response.data.map((currency) => ({
          value: currency.code,
          label: `${currency.code} — ${currency.name}`
        }))
      )
    );
}

/** Static option list helper. */
export function staticOptions(entries: Array<[string, string]>) {
  return entries.map(([value, label]) => ({ value, label }));
}
