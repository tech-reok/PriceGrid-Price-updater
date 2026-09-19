import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ModalComponent } from './modal.component';
import { StatePanelComponent } from './state-panel.component';
import { StatusBadgeComponent } from './status-badge.component';
import { SwitchComponent } from './ui/switch.component';
import { MoneyPipe } from '../core/pipes/money.pipe';
import { AppDatePipe } from '../core/pipes/app-date.pipe';
import { ToastService } from '../core/services/toast.service';
import { TenantContextService } from '../core/services/tenant-context.service';
import { extractApiErrorMessage, extractFieldErrors, readPath } from '../core/utils/format';
import type { CrudResource } from '../core/services/crud-resource';
import type { PageMeta } from '../core/models';
import type {
  ColumnConfig,
  CrossValidator,
  FieldConfig,
  FieldOption,
  OptionLoader,
  PayloadMapper,
  PreviewResult,
  PreviewRunner,
  RowAction
} from './crud-page.types';

const STATUS_CHIPS: FieldOption[] = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' }
];

/**
 * Reusable administrative table + form screen.
 *
 * Every module composes this component with its own columns/fields and service,
 * which keeps the look, the loading/empty/error states and the CRUD behaviour
 * identical across the application.
 */
@Component({
  selector: 'app-crud-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    StatePanelComponent,
    StatusBadgeComponent,
    SwitchComponent,
    MoneyPipe,
    AppDatePipe
  ],
  templateUrl: './crud-page.component.html'
})
export class CrudPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly destroyRef = inject(DestroyRef);

  // --- configuration -------------------------------------------------------
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly entityLabel = input<string>('registro');
  readonly columns = input<ColumnConfig[]>([]);
  readonly fields = input<FieldConfig[]>([]);
  readonly service = input.required<CrudResource<any>>();
  readonly canCreate = input<boolean>(false);
  readonly canEdit = input<boolean>(false);
  readonly canDelete = input<boolean>(false);
  readonly statusFilter = input<boolean>(true);
  readonly searchPlaceholder = input<string>('Buscar…');
  readonly emptyMessage = input<string>('');
  readonly selectSources = input<Record<string, OptionLoader>>({});
  readonly crossValidators = input<CrossValidator[]>([]);
  readonly previewRunner = input<PreviewRunner | null>(null);
  readonly previewLabel = input<string>('Calcular');
  readonly mapToForm = input<((row: any) => Record<string, unknown>) | null>(null);
  readonly mapToPayload = input<PayloadMapper | null>(null);
  readonly pageSize = input<number>(10);
  /** Optional per-row actions (revoke key, manage permissions, ...). */
  readonly rowActions = input<RowAction[]>([]);

  /** Emitted after a successful mutation so hosts can refresh related data. */
  readonly changed = output<void>();

  // --- list state ----------------------------------------------------------
  readonly items = signal<any[]>([]);
  readonly meta = signal<PageMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly status = signal('');
  readonly page = signal(1);
  readonly sort = signal('');
  readonly order = signal<'asc' | 'desc'>('desc');
  readonly statusChips = STATUS_CHIPS;

  // --- form state ----------------------------------------------------------
  readonly modalOpen = signal(false);
  readonly editing = signal<any | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly options = signal<Record<string, FieldOption[]>>({});
  readonly previewResults = signal<PreviewResult[]>([]);
  readonly previewing = signal(false);
  readonly deleteTarget = signal<any | null>(null);
  readonly deleting = signal(false);

  form: FormGroup = this.fb.group({});
  readonly searchInput = new FormControl('');

  readonly isEditing = computed(() => this.editing() !== null);
  readonly modalTitle = computed(() =>
    this.isEditing() ? `Editar ${this.entityLabel()}` : `Nuevo ${this.entityLabel()}`
  );

  /** Controls currently visible, honouring `visibleWhen`, create/edit flags. */
  readonly visibleFields = computed(() =>
    this.fields().filter((field) => {
      if (field.createOnly && this.isEditing()) return false;
      if (field.editOnly && !this.isEditing()) return false;
      return true;
    })
  );

  constructor() {
    this.searchInput.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.search.set(value ?? '');
        this.page.set(1);
        void this.load();
      });
  }

  ngOnInit(): void {
    void this.loadOptions();
    void this.load();

    // Reloads the listing when a global administrator switches company.
    this.tenantContext.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        void this.load();
      });
  }

  // --- data loading --------------------------------------------------------

  private buildQuery(): Record<string, unknown> {
    const query: Record<string, unknown> = { page: this.page(), limit: this.pageSize() };
    if (this.search()) query['search'] = this.search();
    if (this.status()) query['status'] = this.status();
    if (this.sort()) {
      query['sort'] = this.sort();
      query['order'] = this.order();
    }
    return query;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    this.service()
      .list(this.buildQuery())
      .subscribe({
        next: (response: any) => {
          this.items.set(response?.data ?? []);
          this.meta.set(response?.meta ?? { page: 1, limit: this.pageSize(), total: 0, totalPages: 0 });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(extractApiErrorMessage(error));
          this.items.set([]);
          this.loading.set(false);
        }
      });
  }

  /** Loads dynamic select options once per configured source. */
  async loadOptions(): Promise<void> {
    const sources = this.selectSources();
    for (const [key, loader] of Object.entries(sources)) {
      loader().subscribe({
        next: (options) => this.options.update((current) => ({ ...current, [key]: options })),
        error: () => this.options.update((current) => ({ ...current, [key]: [] }))
      });
    }
  }

  optionsFor(field: FieldConfig): FieldOption[] {
    if (field.options) return field.options;
    if (field.optionsKey) return this.options()[field.optionsKey] ?? [];
    return [];
  }

  // --- toolbar -------------------------------------------------------------

  refresh(): void {
    void this.load();
  }

  setStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
    void this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || (this.meta().totalPages > 0 && page > this.meta().totalPages)) return;
    this.page.set(page);
    void this.load();
  }

  toggleSort(column: ColumnConfig): void {
    if (!column.sortable) return;
    if (this.sort() === column.key) {
      this.order.set(this.order() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(column.key);
      this.order.set('asc');
    }
    void this.load();
  }

  // --- table rendering -----------------------------------------------------

  cell(row: any, column: ColumnConfig): unknown {
    return readPath(row, column.key);
  }

  asText(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  }

  asNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  }

  asStatus(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  currencyOf(row: any, column: ColumnConfig): string {
    if (!column.currencyKey) return 'MXN';
    const code = readPath(row, column.currencyKey);
    return typeof code === 'string' && code !== '' ? code : 'MXN';
  }

  isVisible(field: FieldConfig): boolean {
    if (!field.visibleWhen) return true;
    return this.form.get(field.visibleWhen.key)?.value === field.visibleWhen.equals;
  }

  // --- create / edit -------------------------------------------------------

  private buildForm(values: Record<string, unknown>): FormGroup {
    const controls: Record<string, FormControl> = {};

    for (const field of this.fields()) {
      const validators = [];
      if (field.required) validators.push(Validators.required);
      if (field.type === 'number') {
        validators.push(Validators.min(field.min ?? 0));
        if (field.max !== undefined) validators.push(Validators.max(field.max));
      }

      const initial = values[field.key] ?? field.defaultValue ?? (field.type === 'checkbox' ? false : '');
      controls[field.key] = new FormControl(initial, { validators, nonNullable: false });
    }

    const group = this.fb.group(controls);

    for (const validator of this.crossValidators()) {
      group.addValidators(validator);
    }
    group.updateValueAndValidity();

    return group;
  }

  openCreate(): void {
    this.editing.set(null);
    this.form = this.buildForm({});
    this.formError.set(null);
    this.fieldErrors.set({});
    this.previewResults.set([]);
    this.modalOpen.set(true);
  }

  openEdit(row: any): void {
    this.editing.set(row);
    const mapper = this.mapToForm();
    this.form = this.buildForm(mapper ? mapper(row) : row);
    this.formError.set(null);
    this.fieldErrors.set({});
    this.previewResults.set([]);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
    this.previewResults.set([]);
  }

  /** Runs the optional preview (used by the price form to show the final price). */
  runPreview(): void {
    const runner = this.previewRunner();
    if (!runner) return;

    this.previewing.set(true);
    runner(this.form.getRawValue() as Record<string, unknown>).subscribe({
      next: (results) => {
        this.previewResults.set(results);
        this.previewing.set(false);
      },
      error: (error: unknown) => {
        this.formError.set(extractApiErrorMessage(error));
        this.previewResults.set([]);
        this.previewing.set(false);
      }
    });
  }

  submit(): void {
    this.formError.set(null);

    if (this.form.invalid || this.form.errors) {
      this.form.markAllAsTouched();
      const zodErrors = (this.form.errors?.['zod'] ?? {}) as Record<string, string>;
      this.fieldErrors.set(zodErrors);
      if (Object.keys(zodErrors).length > 0) {
        this.formError.set('Revisa los campos marcados.');
      }
      return;
    }

    const mapper = this.mapToPayload();
    const raw = this.form.getRawValue() as Record<string, unknown>;
    const editing = this.editing();
    const payload = mapper ? mapper(raw, { isEditing: editing !== null }) : raw;

    this.saving.set(true);
    const request = editing
      ? this.service().update(editing.id, payload)
      : this.service().create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(
          editing ? `${this.entityLabel()} actualizado correctamente` : `${this.entityLabel()} creado correctamente`
        );
        this.closeModal();
        this.changed.emit();
        void this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(extractApiErrorMessage(error));
        this.fieldErrors.set(extractFieldErrors(error));
      }
    });
  }

  // --- delete --------------------------------------------------------------

  askDelete(row: any): void {
    this.deleteTarget.set(row);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) return;

    this.deleting.set(true);
    this.service()
      .remove(target.id)
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.toast.success(`${this.entityLabel()} eliminado`);
          this.deleteTarget.set(null);
          this.changed.emit();
          void this.load();
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.toast.error(extractApiErrorMessage(error));
          this.deleteTarget.set(null);
        }
      });
  }

  fieldError(key: string): string | null {
    return this.fieldErrors()[key] ?? null;
  }

  isInvalid(field: FieldConfig): boolean {
    const control = this.form.get(field.key);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  visibleRowActions(row: any): RowAction[] {
    return this.rowActions().filter((action) => (action.visible ? action.visible(row) : true));
  }
}
