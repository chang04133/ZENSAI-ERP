import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

type RangePreset = { label: string; value: [Dayjs, Dayjs] };

export const datePresets: RangePreset[] = [
  { label: '오늘', value: [dayjs(), dayjs()] },
  { label: '이번 주', value: [dayjs().startOf('week'), dayjs()] },
  { label: '이번 달', value: [dayjs().startOf('month'), dayjs()] },
  { label: '최근 30일', value: [dayjs().subtract(30, 'day'), dayjs()] },
  { label: '최근 90일', value: [dayjs().subtract(90, 'day'), dayjs()] },
  { label: '올해', value: [dayjs().startOf('year'), dayjs()] },
];
