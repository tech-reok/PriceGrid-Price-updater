export interface TimeZoneOption {
  value: string;
  label: string;
}

const FALLBACK_TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Chicago',
  'America/New_York',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Africa/Johannesburg',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland'
];

export function listTimeZoneOptions(): TimeZoneOption[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const values = new Set(['UTC', ...(intl.supportedValuesOf?.('timeZone') ?? FALLBACK_TIME_ZONES)]);
  return [...values]
    .map((value) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: value,
        timeZoneName: 'longOffset'
      }).formatToParts(new Date());
      const offset = parts.find((part) => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC') ?? 'UTC';
      return { value, label: `${offset} · ${value}` };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}
