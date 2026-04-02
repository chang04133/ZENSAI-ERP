/**
 * CRM 스케줄러 — 자동 캠페인 + 포인트 만료
 * node-cron 설치 필요: npm install node-cron
 */

let initialized = false;

export async function initCrmScheduler() {
  if (initialized) return;
  initialized = true;

  try {
    const cron = await import('node-cron');

    // 매 시간 정각: 자동 캠페인 실행
    cron.schedule('0 * * * *', async () => {
      try {
        const { autoCampaignService } = await import('../modules/crm/auto-campaign.service');
        const result = await autoCampaignService.executeAutoCampaigns();
        if (result.totalSent > 0) {
          console.log(`[CRM Scheduler] Auto campaigns: ${result.totalSent} messages sent`);
        }
      } catch (err) {
        console.error('[CRM Scheduler] Auto campaign error:', err);
      }
    });

    // 10분 간격: 예약 캠페인 발송 체크
    cron.schedule('*/10 * * * *', async () => {
      try {
        const { campaignService } = await import('../modules/crm/campaign.service');
        const result = await campaignService.executeScheduledCampaigns();
        if (result.executed > 0) {
          console.log(`[CRM Scheduler] Scheduled campaigns executed: ${result.executed}`);
        }
      } catch (err) {
        console.error('[CRM Scheduler] Scheduled campaign error:', err);
      }
    });

    // 매일 자정: 포인트 만료 처리
    cron.schedule('0 0 * * *', async () => {
      try {
        const { pointsService } = await import('../modules/crm/points.service');
        const result = await pointsService.expirePoints();
        if (result.totalExpired > 0) {
          console.log(`[CRM Scheduler] Points expired: ${result.totalExpired}P for ${result.customers} customers`);
        }
      } catch (err) {
        console.error('[CRM Scheduler] Points expiry error:', err);
      }
    });

    // 매일 자정: 쿠폰 만료 처리
    cron.schedule('5 0 * * *', async () => {
      try {
        const { couponService } = await import('../modules/crm/coupon.service');
        const result = await couponService.expireCoupons();
        if (result.expired > 0) {
          console.log(`[CRM Scheduler] Coupons expired: ${result.expired}`);
        }
      } catch (err) {
        console.error('[CRM Scheduler] Coupon expiry error:', err);
      }
    });

    // 매주 월요일 새벽 3시: RFM 재계산
    cron.schedule('0 3 * * 1', async () => {
      try {
        const { rfmService } = await import('../modules/crm/rfm.service');
        const result = await rfmService.recalculateAll();
        console.log(`[CRM Scheduler] RFM recalculated: ${result.updated} customers`);
      } catch (err) {
        console.error('[CRM Scheduler] RFM recalculation error:', err);
      }
    });

    // 매주 월요일 새벽 4시: 상품 추천 재계산 (RFM 직후)
    cron.schedule('0 4 * * 1', async () => {
      try {
        const { recommendationService } = await import('../modules/crm/recommendation.service');
        const result = await recommendationService.recalculateAll();
        if (result.calculated > 0) {
          console.log(`[CRM Scheduler] Recommendations recalculated: ${result.calculated} pairs`);
        }
      } catch (err) {
        console.error('[CRM Scheduler] Recommendation recalculation error:', err);
      }
    });

    console.log('[CRM Scheduler] Initialized — auto campaigns (hourly) + scheduled campaigns (10min) + points/coupon expiry (daily) + RFM + recommendations (weekly)');
  } catch {
    console.log('[CRM Scheduler] node-cron not installed, scheduler disabled');
  }
}
