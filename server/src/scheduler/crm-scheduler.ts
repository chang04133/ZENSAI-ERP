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

    console.log('[CRM Scheduler] Initialized — auto campaigns (hourly) + points expiry (daily)');
  } catch {
    console.log('[CRM Scheduler] node-cron not installed, scheduler disabled');
  }
}
