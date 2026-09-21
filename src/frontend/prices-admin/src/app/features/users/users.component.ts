import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { RoleService, UserService } from '../../core/services/access.services';
import { PriceListService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { idOptionLoader, staticOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig, PayloadMapper, RowAction } from '../../shared/crud-page.types';
import type { PriceList, User } from '../../core/models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, CrudPageComponent, ModalComponent],
  template: `
    <app-crud-page
      title="Usuarios"
      subtitle="Accesos a la plataforma y rol asignado."
      entityLabel="usuario"
      searchPlaceholder="Buscar por nombre o correo…"
      emptyMessage="Invita a tu equipo creando el primer usuario."
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [canCreate]="can('users:create')"
      [canEdit]="can('users:update')"
      [canDelete]="can('users:delete')"
      [rowActions]="rowActions"
    />
    <app-modal
      [open]="accessOpen()"
      title="Listas de precios autorizadas"
      subtitle="El usuario sólo podrá consultar las listas seleccionadas."
      (closed)="closeAccess()"
    >
      @if (accessOpen()) {
        <div class="space-y-4">
          <p class="text-sm text-olive">Usuario: <span class="font-medium text-forest">{{ selectedUser()?.name }}</span></p>
          <div class="max-h-72 space-y-2 overflow-y-auto rounded-md border border-line p-3">
            @for (list of availablePriceLists(); track list.id) {
              <label class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-forest hover:bg-sidebar">
                <input type="checkbox" [checked]="selectedAccessIds().has(list.id)" (change)="toggleAccess(list.id)" />
                <span>{{ list.name }}</span>
              </label>
            } @empty { <p class="text-sm text-olive">No hay listas activas disponibles.</p> }
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="rounded-md border border-line px-4 py-2 text-sm text-forest" (click)="closeAccess()">Cancelar</button>
            <button type="button" class="rounded-md bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" [disabled]="accessSaving()" (click)="saveAccess()">{{ accessSaving() ? 'Guardando…' : 'Guardar acceso' }}</button>
          </div>
        </div>
      }
    </app-modal>
  `
})
export class UsersComponent {
  readonly service = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly priceListService = inject(PriceListService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'email', label: 'Correo' },
    { key: 'role.name', label: 'Rol' },
    { key: 'lastLoginAt', label: 'Último acceso', type: 'date' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'email', label: 'Correo electrónico', type: 'text', required: true, placeholder: 'usuario@empresa.com' },
    {
      key: 'password',
      label: 'Contraseña',
      type: 'password',
      required: true,
      createOnly: true,
      help: 'Mínimo 8 caracteres. En edición usa el campo para restablecerla.'
    },
    { key: 'password', label: 'Nueva contraseña', type: 'password', editOnly: true, help: 'Déjalo vacío para conservarla.' },
    { key: 'roleId', label: 'Rol', type: 'select', required: true, optionsKey: 'roles' },
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

  readonly selectSources = {
    roles: idOptionLoader(this.roleService, 'name')
  };

  readonly accessOpen = signal(false);
  readonly accessSaving = signal(false);
  readonly selectedUser = signal<User | null>(null);
  readonly availablePriceLists = signal<PriceList[]>([]);
  readonly selectedAccessIds = signal<Set<string>>(new Set());

  readonly rowActions: RowAction[] = [
    {
      label: 'Listas autorizadas',
      visible: () => this.can('price-list-access:manage'),
      run: (row) => this.openAccess(row)
    }
  ];

  /**
   * An empty password means "keep the current one"; sending `''` would fail the
   * API's minimum-length rule (strict payload validation).
   */
  readonly mapToPayload: PayloadMapper = (values) => {
    const payload: Record<string, unknown> = { ...values };
    if (!payload['password']) delete payload['password'];
    return payload;
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  openAccess(user: User): void {
    this.selectedUser.set(user);
    this.accessOpen.set(true);
    this.selectedAccessIds.set(new Set());
    this.priceListService.list({ limit: 100, status: 'active', sort: 'name', order: 'asc' }).subscribe({
      next: (response) => this.availablePriceLists.set(response.data),
      error: () => this.availablePriceLists.set([])
    });
    this.service.priceListAccess(user.id).subscribe({
      next: (access) => this.selectedAccessIds.set(new Set(access.priceListIds)),
      error: (error) => this.toast.error(error?.error?.message ?? 'No se pudo cargar el acceso')
    });
  }

  toggleAccess(id: string): void {
    const next = new Set(this.selectedAccessIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selectedAccessIds.set(next);
  }

  saveAccess(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.accessSaving.set(true);
    this.service.assignPriceLists(user.id, [...this.selectedAccessIds()]).subscribe({
      next: () => { this.accessSaving.set(false); this.accessOpen.set(false); this.toast.success('Acceso actualizado'); },
      error: (error) => { this.accessSaving.set(false); this.toast.error(error?.error?.message ?? 'No se pudo guardar el acceso'); }
    });
  }

  closeAccess(): void {
    this.accessOpen.set(false);
    this.selectedUser.set(null);
    this.availablePriceLists.set([]);
  }
}
