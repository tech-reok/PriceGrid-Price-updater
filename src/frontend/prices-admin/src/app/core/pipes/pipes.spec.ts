import { StatusLabelPipe } from './status-label.pipe';
import { MoneyPipe } from './money.pipe';
import { AppDatePipe } from './app-date.pipe';

describe('StatusLabelPipe', () => {
  const pipe = new StatusLabelPipe();

  it('translates known statuses', () => {
    expect(pipe.transform('active')).toBe('Activo');
    expect(pipe.transform('inactive')).toBe('Inactivo');
    expect(pipe.transform('revoked')).toBe('Revocado');
    expect(pipe.transform('expired')).toBe('Expirado');
    expect(pipe.transform('api_key')).toBe('API key');
  });

  it('passes through unknown values and handles empties', () => {
    expect(pipe.transform('custom_state')).toBe('custom_state');
    expect(pipe.transform('')).toBe('—');
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
  });
});

describe('MoneyPipe', () => {
  const pipe = new MoneyPipe();

  it('formats an amount with the given currency', () => {
    const formatted = pipe.transform(1234.5, 'MXN');
    expect(formatted).toContain('1,234.50');
  });

  it('returns an em dash for empty values', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
    expect(pipe.transform('')).toBe('—');
    expect(pipe.transform(Number.NaN)).toBe('—');
  });

  it('accepts numeric strings', () => {
    expect(pipe.transform('100', 'MXN')).toContain('100.00');
  });

  it('falls back when the currency code is invalid', () => {
    const result = pipe.transform(10, 'NOT-A-CURRENCY');
    expect(result).toContain('10.00');
  });
});

describe('AppDatePipe', () => {
  const pipe = new AppDatePipe();

  it('formats an ISO date', () => {
    const formatted = pipe.transform('2024-03-15T10:30:00.000Z');
    expect(formatted).toMatch(/2024/);
    expect(formatted).not.toBe('—');
  });

  it('supports including the time', () => {
    const withTime = pipe.transform('2024-03-15T10:30:00.000Z', true);
    expect(withTime.length).toBeGreaterThan(pipe.transform('2024-03-15T10:30:00.000Z').length);
  });

  it('returns an em dash for empty or invalid values', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform('')).toBe('—');
    expect(pipe.transform('not-a-date')).toBe('—');
  });
});
