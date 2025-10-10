// 积分交易接口
export interface PointTransaction {
  id: number;
  user_id: number;
  points: number;
  type: string;
  source?: string;
  description?: string;
  created_at: Date;
}
