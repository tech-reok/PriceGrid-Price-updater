import { AbstractControl, ValidationErrors } from '@angular/forms';
import type { ZodTypeAny } from 'zod';
import type { CrossValidator } from '../../shared/crud-page.types';

/**
 * Bridges a Zod schema into an Angular Reactive Forms group validator.
 * Used for the cross-field rules (discount scope consistency, date ranges).
 */
export function zodValidator(schema: ZodTypeAny): CrossValidator {
  return (control: AbstractControl): ValidationErrors | null => {
    const result = schema.safeParse(control.value);
    if (result.success) return null;

    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_form';
      if (!errors[key]) errors[key] = issue.message;
    }

    return { zod: errors };
  };
}
