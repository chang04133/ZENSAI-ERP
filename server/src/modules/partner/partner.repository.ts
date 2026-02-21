import { BaseRepository } from '../../core/base.repository';
import { Partner } from '../../../../shared/types/partner';

export class PartnerRepository extends BaseRepository<Partner> {
  constructor() {
    super({
      tableName: 'partners',
      primaryKey: 'partner_code',
      searchFields: ['partner_code', 'partner_name'],
      filterFields: ['partner_type', 'is_active'],
      defaultOrder: 'created_at DESC',
    });
  }
}

export const partnerRepository = new PartnerRepository();
