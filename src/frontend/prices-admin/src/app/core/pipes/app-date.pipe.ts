import { Pipe, PipeTransform } from '@angular/core';

/** Formats an ISO timestamp for display; em dash when empty. */
@Pipe({ name: 'appDate', standalone: true })
export class AppDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, withTime = false): string {
    if (!value) return '—';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    const formatted = new Intl.DateTimeFormat('es-MX', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
    }).format(date);

    return formatted;
  }
}
