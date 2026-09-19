import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { RoleService, UserService } from '../../core/services/access.services';
import { SessionStore } from '../../core/services/session.store';
import { idOptionLoader, staticOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig, PayloadMapper } from '../../shared/crud-page.types';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CrudPageComponent],
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
    />
  `
})
export class UsersComponent {
  readonly service = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly session = inject(SessionStore);

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
}
