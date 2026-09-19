import {
  extractApiErrorMessage,
  extractFieldErrors,
  formatMoney,
  humanize,
  readPath,
  toDateInputValue
} from './format';
import { zodValidator } from './validation';
import { FormControl, FormGroup } from '@angular/forms';
import { z } from 'zod';
import { currencyOptionLoader, idOptionLoader, staticOptions } from './options';
import { of } from 'rxjs';

describe('format utilities', () => {
  it('converts dates for date inputs', () => {
    expect(toDateInputValue('2024-03-05T12:00:00.000Z')).toMatch(/^2024-03-0[45]$/);
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('garbage')).toBe('');
    expect(toDateInputValue(new Date('2024-01-02T00:00:00'))).toContain('2024-01-02');
  });

  it('formats money', () => {
    expect(formatMoney(1234.5, 'MXN')).toContain('1,234.50');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(10, 'BAD')).toContain('10.00');
  });

  it('extracts the API error message', () => {
    expect(extractApiErrorMessage({ error: { message: 'Nope' } })).toBe('Nope');
    expect(extractApiErrorMessage(new Error('Boom'))).toBe('Boom');
    expect(extractApiErrorMessage({})).toBe('Ocurrió un error inesperado');
    expect(extractApiErrorMessage({ error: { message: '' } })).toBe('Ocurrió un error inesperado');
  });

  it('extracts field errors from the envelope', () => {
    const errors = extractFieldErrors({
      error: { details: [{ field: 'value', message: 'must be >= 0' }, { message: 'no field' }] }
    });
    expect(errors['value']).toBe('must be >= 0');
    expect(Object.keys(errors).length).toBe(1);
  });

  it('humanizes keys', () => {
    expect(humanize('base_price')).toBe('Base price');
    expect(humanize('basePrice')).toBe('Base Price');
    expect(humanize('sku')).toBe('Sku');
  });

  it('reads nested paths safely', () => {
    expect(readPath({ product: { name: 'TV' } }, 'product.name')).toBe('TV');
    expect(readPath({}, 'product.name')).toBeUndefined();
    expect(readPath(null, 'a.b')).toBeUndefined();
  });
});

describe('zod validator bridge', () => {
  const schema = z.object({ value: z.coerce.number().min(5, 'too small') });
  const validator = zodValidator(schema);

  const group = (value: unknown) => new FormGroup({ value: new FormControl(value) });

  it('returns null when the schema passes', () => {
    expect(validator(group(10))).toBeNull();
  });

  it('maps issues to a field error map', () => {
    const result = validator(group(1));
    expect(result).not.toBeNull();
    expect(result!['zod']['value']).toBe('too small');
  });

  it('uses a fallback key for root issues', () => {
    const rootValidator = zodValidator(z.object({}).refine(() => false, { message: 'root problem' }));
    const result = rootValidator(new FormGroup({}));
    expect(result!['zod']['_form']).toBe('root problem');
  });
});

describe('option loaders', () => {
  it('builds id-based options', (done) => {
    const service = { list: () => of({ data: [{ id: 'a', name: 'Alpha' }], meta: {} }) } as any;
    idOptionLoader(service, 'name')().subscribe((options) => {
      expect(options).toEqual([{ value: 'a', label: 'Alpha' }]);
      done();
    });
  });

  it('falls back to the id when the label is missing', (done) => {
    const service = { list: () => of({ data: [{ id: 'b' }], meta: {} }) } as any;
    idOptionLoader(service, 'name')().subscribe((options) => {
      expect(options[0].label).toBe('b');
      done();
    });
  });

  it('builds currency options keyed by ISO code', (done) => {
    const service = { list: () => of({ data: [{ code: 'MXN', name: 'Peso mexicano' }], meta: {} }) } as any;
    currencyOptionLoader(service)().subscribe((options) => {
      expect(options).toEqual([{ value: 'MXN', label: 'MXN — Peso mexicano' }]);
      done();
    });
  });

  it('builds static options', () => {
    expect(staticOptions([['active', 'Activo']])).toEqual([{ value: 'active', label: 'Activo' }]);
  });
});
