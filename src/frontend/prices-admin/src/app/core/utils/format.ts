/** Formats a Date/ISO value for an `<input type="date">`. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Reads the human message from the API error envelope. */
export function extractApiErrorMessage(error: unknown): string {
  const payload = (error as { error?: unknown })?.error;
  if (payload && typeof payload === 'object') {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Ocurrió un error inesperado';
}

/** Maps `details[].field` from the API envelope to a control-name map. */
export function extractFieldErrors(error: unknown): Record<string, string> {
  const details = (error as { error?: { details?: unknown } })?.error?.details;
  const result: Record<string, string> = {};

  if (Array.isArray(details)) {
    for (const detail of details) {
      const field = (detail as { field?: unknown })?.field;
      const message = (detail as { message?: unknown })?.message;
      if (typeof field === 'string' && typeof message === 'string') {
        result[field] = message;
      }
    }
  }

  return result;
}

/** Formats a monetary amount; shared by pipes and imperative previews. */
export function formatMoney(value: number | null | undefined, currency = 'MXN'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency || 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Turns a snake_case / camelCase key into a readable label. */
export function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (character) => character.toUpperCase());
}

/** Safe nested lookup used by the table renderer. */
export function readPath(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((accumulator, key) => {
      if (accumulator && typeof accumulator === 'object') {
        return (accumulator as Record<string, unknown>)[key];
      }
      return undefined;
    }, source);
}
