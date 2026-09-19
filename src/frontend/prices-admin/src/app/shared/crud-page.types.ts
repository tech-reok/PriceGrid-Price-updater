import { AbstractControl, ValidationErrors } from '@angular/forms';
import { Observable } from 'rxjs';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'date'
  | 'password'
  | 'checkbox'
  | 'toggle';
export type ColumnType = 'text' | 'status' | 'money' | 'date' | 'boolean' | 'code';

export interface FieldOption {
  value: string;
  label: string;
}

/** Declarative description of a form control in the create/edit modal. */
export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  /** Key into the page `selectSources` map for dynamically loaded options. */
  optionsKey?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: unknown;
  /** Renders the control only while another control holds this value. */
  visibleWhen?: { key: string; equals: unknown };
  editOnly?: boolean;
  createOnly?: boolean;
  /** Full-width control in the two-column grid. */
  full?: boolean;
}

export interface ColumnConfig {
  key: string;
  label: string;
  type?: ColumnType;
  /** Column holding the currency code for `money` columns. */
  currencyKey?: string;
  align?: 'left' | 'right';
  sortable?: boolean;
}

export type OptionLoader = () => Observable<FieldOption[]>;
export type CrossValidator = (control: AbstractControl) => ValidationErrors | null;

export interface PreviewResult {
  label: string;
  value: string;
  hint?: string;
}

export type PreviewRunner = (values: Record<string, unknown>) => Observable<PreviewResult[]>;

/** Context handed to `mapToPayload` so a page can tailor create vs update. */
export interface PayloadContext {
  isEditing: boolean;
}

export type PayloadMapper = (
  values: Record<string, unknown>,
  context: PayloadContext
) => Record<string, unknown>;

/** Extra per-row action rendered next to Edit/Delete (e.g. revoke, permissions). */
export interface RowAction {
  label: string;
  run: (row: any) => void;
  tone?: 'default' | 'danger';
  visible?: (row: any) => boolean;
}
