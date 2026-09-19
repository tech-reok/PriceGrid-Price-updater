import { Component, inject, signal, viewChild } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ModalComponent } from '../../shared/modal.component';
import { RoleService } from '../../core/services/access.services';
import { PermissionService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { ToastService } from '../../core/services/toast.service';
import { staticOptions } from '../../core/utils/options';
import { extractApiErrorMessage, humanize } from '../../core/utils/format';
import type { ColumnConfig, FieldConfig, RowAction } from '../../shared/crud-page.types';
import type { Permission, Role } from '../../core/models';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CrudPageComponent, ModalComponent],
  template: `
    <app-crud-page
      title="Roles"
      subtitle="Roles del sistema y roles personalizados de la empresa."
      entityLabel="rol"
      searchPlaceholder="Buscar por nombre o slug…"
      emptyMessage="Los roles de sistema se crean con los seeds."
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [rowActions]="rowActions"
      [canCreate]="can('roles:create')"
      [canEdit]="can('roles:update')"
      [canDelete]="can('roles:delete')"
    />

    <app-modal
      [open]="permissionsOpen()"
      title="Permisos del rol"
      [subtitle]="selectedRole()?.name ?? ''"
      (closed)="closePermissions()"
    >
      @if (loadingPermissions()) {
        <p class="text-sm text-olive">Cargando permisos…</p>
      } @else {
        <div class="max-h-96 overflow-y-auto space-y-1.5" data-testid="permissions-list">
          @for (permission of allPermissions(); track permission.slug) {
            <label class="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-sidebar/60 cursor-pointer">
              <input
                type="checkbox"
                class="mt-0.5 rounded border-line text-forest focus:ring-forest"
                [checked]="isSelected(permission.slug)"
                (change)="togglePermission(permission.slug)"
              />
              <span>
                <span class="block text-sm font-medium text-forest">{{ permission.slug }}</span>
                <span class="block text-xs text-olive">{{ permission.description || humanize(permission.slug) }}</span>
              </span>
            </label>
          }
        </div>

        <div class="pt-4 mt-4 flex items-center justify-between gap-3 border-t border-line">
          <p class="text-xs text-olive">{{ selectedSlugs().length }} permisos seleccionados</p>
          <div class="flex gap-3">
            <button
              type="button"
              class="px-4 py-2.5 bg-header text-forest border border-line rounded-md text-sm font-medium hover:bg-active transition-colors"
              (click)="closePermissions()"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="px-5 py-2.5 bg-forest text-white rounded-md text-sm font-medium hover:bg-forest/90 transition-colors disabled:opacity-60"
              [disabled]="savingPermissions()"
              (click)="savePermissions()"
              data-testid="save-permissions"
            >
              {{ savingPermissions() ? 'Guardando…' : 'Guardar permisos' }}
            </button>
          </div>
        </div>
      }
    </app-modal>
  `
})
export class RolesComponent {
  readonly service = inject(RoleService);
  private readonly permissionService = inject(PermissionService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly crudPage = viewChild(CrudPageComponent);

  readonly permissionsOpen = signal(false);
  readonly loadingPermissions = signal(false);
  readonly savingPermissions = signal(false);
  readonly selectedRole = signal<Role | null>(null);
  readonly allPermissions = signal<Permission[]>([]);
  readonly selectedSlugs = signal<string[]>([]);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'slug', label: 'Slug' },
    { key: 'isSystem', label: 'Sistema', type: 'boolean' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'slug', label: 'Slug', type: 'text', required: true, placeholder: 'analista_precios' },
    { key: 'description', label: 'Descripción', type: 'textarea', full: true },
    {
      key: 'status',
      label: 'Estado',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: staticOptions([
        ['active', 'Activo'],
        ['inactive', 'Inactivo']
      ])
    }
  ];

  readonly rowActions: RowAction[] = [
    {
      label: 'Permisos',
      visible: () => this.can('roles:assign-permissions'),
      run: (row) => this.openPermissions(row as Role)
    }
  ];

  humanize = humanize;

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  isSelected(slug: string): boolean {
    return this.selectedSlugs().includes(slug);
  }

  togglePermission(slug: string): void {
    this.selectedSlugs.update((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    );
  }

  openPermissions(role: Role): void {
    this.selectedRole.set(role);
    this.permissionsOpen.set(true);
    this.loadingPermissions.set(true);

    this.permissionService.list({ limit: 200 }).subscribe({
      next: (response) => {
        this.allPermissions.set(response.data);
        this.service.permissions(role.id).subscribe({
          next: (result) => {
            this.selectedSlugs.set(result.permissionSlugs);
            this.loadingPermissions.set(false);
          },
          error: () => {
            this.selectedSlugs.set([]);
            this.loadingPermissions.set(false);
          }
        });
      },
      error: (error: unknown) => {
        this.loadingPermissions.set(false);
        this.toast.error(extractApiErrorMessage(error));
      }
    });
  }

  closePermissions(): void {
    this.permissionsOpen.set(false);
    this.selectedRole.set(null);
  }

  savePermissions(): void {
    const role = this.selectedRole();
    if (!role) return;

    this.savingPermissions.set(true);
    this.service.assignPermissions(role.id, this.selectedSlugs()).subscribe({
      next: () => {
        this.savingPermissions.set(false);
        this.toast.success('Permisos actualizados');
        this.closePermissions();
        this.crudPage()?.refresh();
      },
      error: (error: unknown) => {
        this.savingPermissions.set(false);
        this.toast.error(extractApiErrorMessage(error));
      }
    });
  }
}
