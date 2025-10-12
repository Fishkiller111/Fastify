export interface ReferralCode {
  id: number;
  user_id: number;
  code: string;
  is_active: boolean;
  created_at: Date;
}

export interface ReferralRelationship {
  id: number;
  inviter_id: number;
  invitee_id: number;
  referral_code: string;
  activated_at: Date;
}

export interface CommissionTier {
  id: number;
  tier_name: string;
  volume: number;
  commission_rate: number;
  tier_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CommissionRecord {
  id: number;
  inviter_id: number;
  invitee_id: number;
  bet_id: number;
  bet_amount: number;
  commission_rate: number;
  commission_amount: number;
  tier_id: number | null;
  status: 'pending' | 'settled' | 'cancelled';
  created_at: Date;
  settled_at: Date | null;
}

export interface ReferralStatistics {
  inviter_id: number;
  total_invitees: number;
  total_volume: number;
  total_commission_earned: number;
  pending_commission: number;
  current_tier: CommissionTier | null;
  next_tier: CommissionTier | null;
  volume_to_next_tier: number | null;
}

export interface CreateCommissionTierRequest {
  tier_name: string;
  volume: number;
  commission_rate: number;
  tier_order: number;
}

export interface UpdateCommissionTierRequest {
  tier_name?: string;
  volume?: number;
  commission_rate?: number;
  tier_order?: number;
  is_active?: boolean;
}
