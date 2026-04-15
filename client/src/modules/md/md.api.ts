import { apiFetch, safeJson } from '../../core/api.client';

async function parse(res: Response) {
  const data = await safeJson(res);
  if (!data.success) throw new Error(data.error || '요청 실패');
  return data.data;
}

export const mdApi = {
  abcAnalysis: async (dateFrom: string, dateTo: string, category?: string, abcA?: number, abcB?: number) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (category) p.set('category', category);
    if (abcA) p.set('abc_a', String(abcA));
    if (abcB) p.set('abc_b', String(abcB));
    return parse(await apiFetch(`/api/md/abc-analysis?${p}`));
  },
  marginAnalysis: async (dateFrom: string, dateTo: string, category?: string, groupBy?: string, costMode?: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (category) p.set('category', category);
    if (groupBy) p.set('group_by', groupBy);
    if (costMode) p.set('cost_mode', costMode);
    return parse(await apiFetch(`/api/md/margin-analysis?${p}`));
  },
seasonPerformance: async (year?: number, compareYears?: number[], monthFrom?: number, monthTo?: number) => {
    const p = new URLSearchParams();
    if (year) p.set('year', String(year));
    if (compareYears?.length) p.set('compare_years', compareYears.join(','));
    if (monthFrom) p.set('month_from', String(monthFrom));
    if (monthTo) p.set('month_to', String(monthTo));
    return parse(await apiFetch(`/api/md/season-performance?${p}`));
  },
  seasonCategory: async (years: number[], monthFrom?: number, monthTo?: number) => {
    const p = new URLSearchParams({ years: years.join(',') });
    if (monthFrom) p.set('month_from', String(monthFrom));
    if (monthTo) p.set('month_to', String(monthTo));
    return parse(await apiFetch(`/api/md/season-category?${p}`));
  },
  sizeColorTrends: async (dateFrom: string, dateTo: string, category?: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (category) p.set('category', category);
    return parse(await apiFetch(`/api/md/size-color-trends?${p}`));
  },
  markdownEffectiveness: async (seasonCode?: string, scheduleId?: number, compareDays?: number) => {
    const p = new URLSearchParams();
    if (seasonCode) p.set('season_code', seasonCode);
    if (scheduleId) p.set('schedule_id', String(scheduleId));
    if (compareDays) p.set('compare_days', String(compareDays));
    return parse(await apiFetch(`/api/md/markdown-effectiveness?${p}`));
  },
  storeProductFit: async (dateFrom: string, dateTo: string, metric?: string, excludePartners?: string[]) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (metric) p.set('metric', metric);
    if (excludePartners?.length) p.set('exclude_partners', excludePartners.join(','));
    return parse(await apiFetch(`/api/md/store-product-fit?${p}`));
  },
  storeProductComparison: async (dateFrom: string, dateTo: string, metric?: string, strongPct?: number) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (metric) p.set('metric', metric);
    if (strongPct) p.set('strong_pct', String(strongPct));
    return parse(await apiFetch(`/api/md/store-product-comparison?${p}`));
  },
  storeProductRanking: async (dateFrom: string, dateTo: string, partnerCode: string, metric?: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, partner_code: partnerCode });
    if (metric) p.set('metric', metric);
    return parse(await apiFetch(`/api/md/store-product-ranking?${p}`));
  },
  getAbcSettings: async () => {
    const res = await apiFetch('/api/system/settings');
    const data = await res.json();
    if (!data.success) return { abc_a: 70, abc_b: 90 };
    return {
      abc_a: parseInt(data.data?.MD_ABC_A_THRESHOLD || '70', 10),
      abc_b: parseInt(data.data?.MD_ABC_B_THRESHOLD || '90', 10),
    };
  },
  saveAbcSettings: async (abc_a: number, abc_b: number) => {
    return parse(await apiFetch('/api/system/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ MD_ABC_A_THRESHOLD: String(abc_a), MD_ABC_B_THRESHOLD: String(abc_b) }),
    }));
  },
  getMarginSettings: async () => {
    const res = await apiFetch('/api/system/settings');
    const data = await res.json();
    if (!data.success) return { cost_multiplier: 35, distribution_fee: 0, manager_fee: 0 };
    return {
      cost_multiplier: parseInt(data.data?.MD_COST_MULTIPLIER || '35', 10),
      distribution_fee: parseInt(data.data?.MD_DISTRIBUTION_FEE_PCT || '0', 10),
      manager_fee: parseInt(data.data?.MD_MANAGER_FEE_PCT || '0', 10),
    };
  },
  saveMarginSettings: async (costMul: number, distFee: number, mgrFee: number) => {
    return parse(await apiFetch('/api/system/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MD_COST_MULTIPLIER: String(costMul),
        MD_DISTRIBUTION_FEE_PCT: String(distFee),
        MD_MANAGER_FEE_PCT: String(mgrFee),
      }),
    }));
  },
  getStoreFitSettings: async () => {
    const res = await apiFetch('/api/system/settings');
    const data = await res.json();
    if (!data.success) return { metric: 'revenue', strong_pct: 150, weak_pct: 50, top_count: 10, exclude_partners: [] as string[] };
    return {
      metric: data.data?.MD_STORE_FIT_METRIC || 'revenue',
      strong_pct: parseInt(data.data?.MD_STORE_FIT_STRONG_PCT || '150', 10),
      weak_pct: parseInt(data.data?.MD_STORE_FIT_WEAK_PCT || '50', 10),
      top_count: parseInt(data.data?.MD_STORE_FIT_TOP_COUNT || '10', 10),
      exclude_partners: (data.data?.MD_STORE_FIT_EXCLUDE_PARTNERS || '').split(',').filter(Boolean),
    };
  },
  saveStoreFitSettings: async (metric: string, strongPct: number, weakPct: number, topCount: number, excludePartners?: string[]) => {
    return parse(await apiFetch('/api/system/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MD_STORE_FIT_METRIC: metric,
        MD_STORE_FIT_STRONG_PCT: String(strongPct),
        MD_STORE_FIT_WEAK_PCT: String(weakPct),
        MD_STORE_FIT_TOP_COUNT: String(topCount),
        MD_STORE_FIT_EXCLUDE_PARTNERS: (excludePartners || []).join(','),
      }),
    }));
  },
  styleProductivity: async (year: number, category?: string, compareYears?: number[]) => {
    const p = new URLSearchParams({ year: String(year) });
    if (category) p.set('category', category);
    if (compareYears?.length) p.set('compare_years', compareYears.join(','));
    return parse(await apiFetch(`/api/md/style-productivity?${p}`));
  },
  vmdEffect: async (dateFrom: string, dateTo: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    return parse(await apiFetch(`/api/md/vmd-effect?${p}`));
  },
  saveSeasonConfigs: async (year: number, items: Array<{
    season_code: string; season_name?: string; status?: string;
    target_styles?: number; target_qty?: number; target_revenue?: number;
  }>) => {
    return parse(await apiFetch('/api/md/season-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, items }),
    }));
  },
};
