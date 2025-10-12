import pool from '../config/database.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 邀请码表
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(20) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_referral_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 2. 邀请关系表
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_relationships (
        id SERIAL PRIMARY KEY,
        inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referral_code VARCHAR(20) NOT NULL,
        activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_invitee FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT unique_invitee UNIQUE (invitee_id)
      );
    `);

    // 3. 反佣等级配置表 - 使用单个volume字段
    await client.query(`
      CREATE TABLE IF NOT EXISTS commission_tiers (
        id SERIAL PRIMARY KEY,
        tier_name VARCHAR(50) NOT NULL,
        volume DECIMAL(20, 2) NOT NULL,
        commission_rate DECIMAL(5, 4) NOT NULL,
        tier_order INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_commission_rate CHECK (commission_rate >= 0 AND commission_rate <= 1)
      );
    `);

    // 4. 反佣记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS commission_records (
        id SERIAL PRIMARY KEY,
        inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bet_id INTEGER NOT NULL REFERENCES meme_bets(id) ON DELETE CASCADE,
        bet_amount DECIMAL(20, 2) NOT NULL,
        commission_rate DECIMAL(5, 4) NOT NULL,
        commission_amount DECIMAL(20, 2) NOT NULL,
        tier_id INTEGER REFERENCES commission_tiers(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        settled_at TIMESTAMP,
        CONSTRAINT fk_commission_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_commission_invitee FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_commission_bet FOREIGN KEY (bet_id) REFERENCES meme_bets(id) ON DELETE CASCADE,
        CONSTRAINT check_status CHECK (status IN ('pending', 'settled', 'cancelled'))
      );
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
      CREATE INDEX IF NOT EXISTS idx_referral_relationships_inviter ON referral_relationships(inviter_id);
      CREATE INDEX IF NOT EXISTS idx_referral_relationships_invitee ON referral_relationships(invitee_id);
      CREATE INDEX IF NOT EXISTS idx_commission_tiers_order ON commission_tiers(tier_order);
      CREATE INDEX IF NOT EXISTS idx_commission_records_inviter ON commission_records(inviter_id);
      CREATE INDEX IF NOT EXISTS idx_commission_records_status ON commission_records(status);
    `);

    // 插入默认反佣等级
    await client.query(`
      INSERT INTO commission_tiers (tier_name, volume, commission_rate, tier_order)
      VALUES
        ('CipherSignal', 0, 0.01, 1),
        ('ShadowTact', 50000, 0.015, 2),
        ('MajorWin', 250000, 0.02, 3),
        ('SealOracle', 500000, 0.025, 4)
      ON CONFLICT DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 008: Referral system tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 008 failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DROP TABLE IF EXISTS commission_records CASCADE');
    await client.query('DROP TABLE IF EXISTS commission_tiers CASCADE');
    await client.query('DROP TABLE IF EXISTS referral_relationships CASCADE');
    await client.query('DROP TABLE IF EXISTS referral_codes CASCADE');

    await client.query('COMMIT');
    console.log('✅ Migration 008: Referral system tables dropped successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 008 rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
