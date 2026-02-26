export interface SizeRun {
  run_id: number;
  run_name: string;
  category?: string;
  memo?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  details?: SizeRunDetail[];
}

export interface SizeRunDetail {
  detail_id: number;
  run_id: number;
  size: string;
  ratio: number;
}
