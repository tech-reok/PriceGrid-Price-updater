import { Pipe, PipeTransform } from '@angular/core';

const LABELS: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  revoked: 'Revocado',
  expired: 'Expirado',
  vigente: 'Vigente',
  system: 'Sistema',
  user: 'Usuario',
  api_key: 'API key'
};

/** Translates API status values into the UI copy. */
@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    return LABELS[value] ?? value;
  }
}
