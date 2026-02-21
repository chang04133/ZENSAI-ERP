import { BaseService } from '../../core/base.service';
import { Partner } from '../../../../shared/types/partner';
import { partnerRepository } from './partner.repository';

class PartnerService extends BaseService<Partner> {
  constructor() {
    super(partnerRepository);
  }
}

export const partnerService = new PartnerService();
