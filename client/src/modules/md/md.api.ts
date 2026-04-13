import { apiFetch } from '../../core/api.client';

async function parse(res: Response) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const mdApi = {
  abcAnalysis: async (dateFrom: string, dateTo: string, category?: string, dimension?: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (category) p.set('category', category);
    if (dimension) p.set('dimension', dimension);
    return parse(await apiFetch(`/api/md/abc-analysis?${p}`));
  },
  marginAnalysis: async (dateFrom: string, dateTo: string, category?: string, groupBy?: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (category) p.set('category', category);
    if (groupBy) p.set('group_by', groupBy);
    return parse(await apiFetch(`/api/md/margin-analysis?${p}`));
  },
  inventoryTurnover: async (dateFrom: string, dateTo: string, category?: string, groupBy?: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (category) p.set('category', category);
    if (groupBy) p.set('group_by', groupBy);
    return parse(await apiFetch(`/api/md/inventory-turnover?${p}`));
  },
  seasonPerformance: async (year?: number) => {
    const p = new URLSearchParams();
    if (year) p.set('year', String(year));
    return parse(await apiFetch(`/api/md/season-performance?${p}`));
  },
  sizeColorTrends: async (dateFrom: string, dateTo: string, category?: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (category) p.set('category', category);
    return parse(await apiFetch(`/api/md/size-color-trends?${p}`));
  },
  markdownEffectiveness: async (seasonCode?: string, scheduleId?: number) => {
    const p = new URLSearchParams();
    if (seasonCode) p.set('season_code', seasonCode);
    if (scheduleId) p.set('schedule_id', String(scheduleId));
    return parse(await apiFetch(`/api/md/markdown-effectiveness?${p}`));
  },
  storeProductFit: async (dateFrom: string, dateTo: string, metric?: string) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (metric) p.set('metric', metric);
    return parse(await apiFetch(`/api/md/store-product-fit?${p}`));
  },
};
