import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { assertReferencesBelongToTenant } from '../common/utils/tenant-references';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext } from '../types';

interface ScopeState {
  appliesTo: string;
  productId: string | null;
  priceListId: string | null;
  marketplaceId: string | null;
}

/**
 * Discounts are product-, price-list- or marketplace-scoped. Because the two
 * unused scope columns are necessarily NULL, the schema cannot express a
 * composite `tenant_id` foreign key, so tenant ownership of the referenced
 * entity is enforced here on every write.
 */
@injectable()
export class DiscountService extends CrudService<any> {
  constructor(
    @inject(TOKENS.DiscountRepository) repository: TenantCrudRepository<any>,
    @inject(TOKENS.ProductRepository) private readonly productRepository: TenantCrudRepository<any>,
    @inject(TOKENS.PriceListRepository) private readonly priceListRepository: TenantCrudRepository<any>,
    @inject(TOKENS.MarketplaceRepository) private readonly marketplaceRepository: TenantCrudRepository<any>
  ) {
    super(repository, 'Discount');
  }

  private async assertScopeBelongsToTenant(tenantId: string | null, scope: ScopeState): Promise<void> {
    switch (scope.appliesTo) {
      case 'product':
        await assertReferencesBelongToTenant([
          {
            repository: this.productRepository,
            tenantId,
            id: scope.productId,
            field: 'productId',
            label: 'product'
          }
        ]);
        return;
      case 'price_list':
        await assertReferencesBelongToTenant([
          {
            repository: this.priceListRepository,
            tenantId,
            id: scope.priceListId,
            field: 'priceListId',
            label: 'price list'
          }
        ]);
        return;
      case 'marketplace':
        await assertReferencesBelongToTenant([
          {
            repository: this.marketplaceRepository,
            tenantId,
            id: scope.marketplaceId,
            field: 'marketplaceId',
            label: 'marketplace'
          }
        ]);
        return;
      default:
        return;
    }
  }

  override async create(
    tenantId: string | null,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    await this.assertScopeBelongsToTenant(tenantId, {
      appliesTo: String(data.appliesTo),
      productId: (data.productId as string) ?? null,
      priceListId: (data.priceListId as string) ?? null,
      marketplaceId: (data.marketplaceId as string) ?? null
    });

    return super.create(tenantId, data, actor);
  }

  override async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const existing = await this.get(tenantId, id);

    // Merge the partial payload with the stored scope before validating.
    const effective: ScopeState = {
      appliesTo: (data.appliesTo as string) ?? existing.appliesTo,
      productId: data.productId !== undefined ? (data.productId as string) : existing.productId,
      priceListId: data.priceListId !== undefined ? (data.priceListId as string) : existing.priceListId,
      marketplaceId:
        data.marketplaceId !== undefined ? (data.marketplaceId as string) : existing.marketplaceId
    };

    await this.assertScopeBelongsToTenant(tenantId, effective);

    return super.update(tenantId, id, data, actor);
  }
}
