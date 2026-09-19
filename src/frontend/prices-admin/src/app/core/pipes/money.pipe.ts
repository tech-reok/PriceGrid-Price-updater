import { Pipe, PipeTransform } from '@angular/core';

/** Formats a monetary amount using the price currency. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: number | string | null | undefined, currency = 'MXN'): string {
    if (value === null || value === undefined || value === '') return '—';

    const amount = typeof value === 'string' ? Number(value) : value;
    if (typeof amount !== 'number' || Number.isNaN(amount)) return '—';

    try {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: currency || 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }
}
