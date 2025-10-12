// 会员等级接口
export interface MembershipLevel {
  id: number;
  name: string;
  level: number;
  upgrade_fee: number; // 升级到本等级需累计充值金额（单位：分）
  gift_points: number; // 升级后立即赠送的积分
  description?: string;
  extra?: Record<string, any>; // 其它权益（JSON 扩展）
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
