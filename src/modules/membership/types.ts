// 会员等级接口
export interface MembershipLevel {
  id: number;
  name: string;
  level: number;
  min_points: number;
  description?: string;
  权益: Record<string, any>; // 等级权益，以JSON格式存储
  created_at: Date;
  updated_at: Date;
}
// 用户会员信息接口
export interface UserMembership {
  id: number;
  user_id: number;
  level_id?: number;
  current_points: number;
  total_points: number;
  points_expire_date?: Date;
  created_at: Date;
  updated_at: Date;
}
