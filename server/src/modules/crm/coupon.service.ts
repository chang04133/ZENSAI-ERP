import { couponRepository } from './coupon.repository';
import { Coupon } from '../../../../shared/types/crm';

class CouponService {
  async list(options: any) {
    return couponRepository.list(options);
  }

  async getById(id: number) {
    return couponRepository.getById(id);
  }

  async create(data: Partial<Coupon>) {
    if (!data.coupon_code) {
      data.coupon_code = this.generateCode();
    }
    return couponRepository.create(data);
  }

  async update(id: number, data: Partial<Coupon>) {
    const coupon = await couponRepository.getById(id);
    if (!coupon) throw new Error('쿠폰을 찾을 수 없습니다.');
    return couponRepository.update(id, data);
  }

  async deactivate(id: number) {
    const coupon = await couponRepository.getById(id);
    if (!coupon) throw new Error('쿠폰을 찾을 수 없습니다.');
    return couponRepository.deactivate(id);
  }

  /** 고객에게 쿠폰 발급 */
  async issue(couponId: number, customerIds: number[], issuedBy: string) {
    const coupon = await couponRepository.getById(couponId);
    if (!coupon) throw new Error('쿠폰을 찾을 수 없습니다.');
    if (!coupon.is_active) throw new Error('비활성화된 쿠폰은 발급할 수 없습니다.');

    // 발급 한도 체크
    if (coupon.usage_limit) {
      const totalIssued = await couponRepository.getTotalIssuedCount(couponId);
      const remaining = coupon.usage_limit - totalIssued;
      if (remaining <= 0) throw new Error('쿠폰 발급 한도에 도달했습니다.');
      if (customerIds.length > remaining) {
        customerIds = customerIds.slice(0, remaining);
      }
    }

    // 고객별 중복 발급 체크
    const eligible: number[] = [];
    for (const cid of customerIds) {
      const issued = await couponRepository.getIssuedCount(couponId, cid);
      if (issued < coupon.usage_per_customer) {
        eligible.push(cid);
      }
    }

    if (eligible.length === 0) throw new Error('발급 가능한 고객이 없습니다. (중복 발급 한도 초과)');

    const count = await couponRepository.issue(couponId, eligible, issuedBy, coupon.valid_days);
    return { issued: count, skipped: customerIds.length - eligible.length };
  }

  /** 세그먼트 기반 일괄 발급 */
  async issueBySegment(couponId: number, segmentId: number, issuedBy: string) {
    const { segmentRepository } = await import('./segment.repository');
    await segmentRepository.refreshMembers(segmentId);
    const members = await segmentRepository.getMembers(segmentId, { limit: '10000' });
    const customerIds = (members.data || []).map((m: any) => m.customer_id);
    if (customerIds.length === 0) throw new Error('세그먼트에 멤버가 없습니다.');
    return this.issue(couponId, customerIds, issuedBy);
  }

  /** 고객별 쿠폰 목록 */
  async getCustomerCoupons(customerId: number, status?: string) {
    return couponRepository.getCustomerCoupons(customerId, status);
  }

  /** 쿠폰 사용 */
  async useCoupon(customerCouponId: number, saleId: number, discountAmount: number) {
    return couponRepository.useCoupon(customerCouponId, saleId, discountAmount);
  }

  /** 만료 처리 (스케줄러용) */
  async expireCoupons() {
    const expired = await couponRepository.expireCoupons();
    return { expired };
  }

  /** 쿠폰 코드 자동 생성 */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export const couponService = new CouponService();
