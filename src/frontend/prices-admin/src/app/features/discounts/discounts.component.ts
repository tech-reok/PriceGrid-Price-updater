import { Component, inject } from '@angular/core';
import { z } from 'zod';
import { CrudPageComponent } from '../../shared/crud-page.component';
import {
  DiscountService,
  MarketplaceService,
  PriceListService,
  ProductService
} from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { idOptionLoader, staticOptions } from '../../core/utils/options';
import { toDateInputValue } from '../../core/utils/format';
import { zodValidator } from '../../core/utils/validation';
import type { ColumnConfig, FieldConfig } from '../../shared/crud-page.types';

/**
 * Cross-field rules for the discount form (mirrors the API validator):
 * exactly one scope reference matching `appliesTo`, percentage <= 100 and a
 * valid date range.
 */
const discountFormSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es obligatorio'),
    type: z.enum(['percentage', 'fixed']),
    value: z.coerce.number().nonnegative('El valor no puede ser negativo'),
    appliesTo: z.enum(['product', 'price_list', 'marketplace']),
    productId: z.string().optional().nullable(),
    priceListId: z.string().optional().nullable(),
    marketplaceId: z.string().optional().nullable(),
    startDate: z.string().min(1, 'La fecha de inicio es obligatoria'),
    endDate: z.string().optional().nullable()
  })
  .superRefine((data, ctx) => {
    const scopeFields: Record<string, 'productId' | 'priceListId' | 'marketplaceId'> = {
      product: 'productId',
      price_list: 'priceListId',
      marketplace: 'marketplaceId'
    };

    for (const [scope, field] of Object.entries(scopeFields)) {
      const isSet = Boolean(data[field]);
      if (scope === data.appliesTo && !isSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'Selecciona el registro al que aplica el descuento'
        });
      }
      if (scope !== data.appliesTo && isSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'Este campo no aplica para el alcance seleccionado'
        });
      }
    }

    if (data.type === 'percentage' && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'El porcentaje no puede ser mayor a 100'
      });
    }

    if (data.endDate && new Date(data.endDate) <= new Date(data.startDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'La fecha de fin debe ser posterior a la de inicio'
      });
    }
  });

@Component({
  selector: 'app-discounts',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Descuentos"
      subtitle="Un solo descuento por precio, con prioridad producto → lista → marketplace."
      entityLabel="descuento"
      searchPlaceholder="Buscar por nombre…"
      emptyMessage="Crea un descuento porcentual o de monto fijo con su vigencia."
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [crossValidators]="crossValidators"
      [mapToForm]="mapToForm"
      [mapToPayload]="mapToPayload"
      [canCreate]="can('discounts:create')"
      [canEdit]="can('discounts:update')"
      [canDelete]="can('discounts:delete')"
    />
  `
})
export class DiscountsComponent {
  readonly service = inject(DiscountService);
  private readonly productService = inject(ProductService);
  private readonly priceListService = inject(PriceListService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'type', label: 'Tipo' },
    { key: 'value', label: 'Valor', align: 'right' },
    { key: 'appliesTo', label: 'Aplica a' },
    { key: 'priority', label: 'Prioridad', align: 'right' },
    { key: 'startDate', label: 'Inicio', type: 'date' },
    { key: 'endDate', label: 'Fin', type: 'date' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Descuento de temporada' },
    {
      key: 'type',
      label: 'Tipo de descuento',
      type: 'select',
      required: true,
      defaultValue: 'percentage',
      options: staticOptions([
        ['percentage', 'Porcentaje'],
        ['fixed', 'Monto fijo']
      ])
    },
    { key: 'value', label: 'Valor', type: 'number', required: true, min: 0, step: 0.01, help: 'Porcentaje (0-100) o monto fijo.' },
    {
      key: 'appliesTo',
      label: 'Aplicación',
      type: 'select',
      required: true,
      defaultValue: 'product',
      options: staticOptions([
        ['product', 'Producto'],
        ['price_list', 'Lista de precios'],
        ['marketplace', 'Marketplace']
      ])
    },
    {
      key: 'productId',
      label: 'Producto relacionado',
      type: 'select',
      optionsKey: 'products',
      visibleWhen: { key: 'appliesTo', equals: 'product' }
    },
    {
      key: 'priceListId',
      label: 'Lista relacionada',
      type: 'select',
      optionsKey: 'priceLists',
      visibleWhen: { key: 'appliesTo', equals: 'price_list' }
    },
    {
      key: 'marketplaceId',
      label: 'Marketplace relacionado',
      type: 'select',
      optionsKey: 'marketplaces',
      visibleWhen: { key: 'appliesTo', equals: 'marketplace' }
    },
    { key: 'startDate', label: 'Fecha de inicio', type: 'date', required: true },
    { key: 'endDate', label: 'Fecha de fin', type: 'date', help: 'Opcional.' },
    { key: 'priority', label: 'Prioridad', type: 'number', min: 0, defaultValue: 100, help: 'Menor valor = mayor prioridad.' },
    {
      key: 'status',
      label: 'Descuento activo',
      type: 'toggle',
      defaultValue: true,
      help: 'Solo los descuentos activos se aplican al cálculo del precio final.'
    },
    { key: 'description', label: 'Descripción', type: 'textarea', full: true }
  ];

  readonly selectSources = {
    products: idOptionLoader(this.productService, 'name'),
    priceLists: idOptionLoader(this.priceListService, 'name'),
    marketplaces: idOptionLoader(this.marketplaceService, 'name')
  };

  readonly crossValidators = [zodValidator(discountFormSchema)];

  readonly mapToForm = (row: Record<string, any>): Record<string, unknown> => ({
    name: row['name'] ?? '',
    type: row['type'] ?? 'percentage',
    value: Number(row['value'] ?? 0),
    appliesTo: row['appliesTo'] ?? 'product',
    productId: row['productId'] ?? '',
    priceListId: row['priceListId'] ?? '',
    marketplaceId: row['marketplaceId'] ?? '',
    startDate: toDateInputValue(row['startDate']),
    endDate: toDateInputValue(row['endDate']),
    priority: row['priority'] ?? 100,
    status: (row['status'] ?? 'active') === 'active',
    description: row['description'] ?? ''
  });

  readonly mapToPayload = (values: Record<string, unknown>): Record<string, unknown> => ({
    name: values['name'],
    type: values['type'],
    value: Number(values['value'] ?? 0),
    appliesTo: values['appliesTo'],
    productId: values['appliesTo'] === 'product' ? values['productId'] || null : null,
    priceListId: values['appliesTo'] === 'price_list' ? values['priceListId'] || null : null,
    marketplaceId: values['appliesTo'] === 'marketplace' ? values['marketplaceId'] || null : null,
    startDate: values['startDate'] ? new Date(String(values['startDate'])).toISOString() : null,
    endDate: values['endDate'] ? new Date(String(values['endDate'])).toISOString() : null,
    priority: Number(values['priority'] ?? 100),
    status: values['status'] ? 'active' : 'inactive',
    description: values['description'] || null
  });

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
