import { create } from 'zustand';
import type { MenuItem } from '../routes/menu';

export interface TabItem {
  key: string;   // route path (e.g. '/sales/entry')
  label: string; // display name (e.g. '매출등록')
}

interface TabState {
  tabs: TabItem[];
  addTab: (tab: TabItem) => void;
  removeTab: (key: string) => string; // returns next active key
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [{ key: '/', label: '대시보드' }],

  addTab: (tab) => {
    set((state) => {
      if (state.tabs.some((t) => t.key === tab.key)) return state;
      return { tabs: [...state.tabs, tab] };
    });
  },

  removeTab: (key) => {
    if (key === '/') return '/'; // 대시보드는 닫을 수 없음
    const { tabs } = get();
    const idx = tabs.findIndex((t) => t.key === key);
    const newTabs = tabs.filter((t) => t.key !== key);
    set({ tabs: newTabs });
    // 닫힌 탭 다음/이전 탭 반환
    if (newTabs.length === 0) return '/';
    return newTabs[Math.min(idx, newTabs.length - 1)].key;
  },
}));

/** 메뉴 아이템에서 key에 해당하는 label 찾기 */
export function findMenuLabel(items: MenuItem[], key: string): string | null {
  for (const item of items) {
    if (item.key === key) return item.label;
    if (item.children) {
      const found = findMenuLabel(item.children, key);
      if (found) return found;
    }
  }
  return null;
}
