import pool from '../config/database.js';

async function resetReferralTables() {
  const client = await pool.connect();
  try {
    console.log('🗑️  删除旧的邀请系统表...');

    await client.query('BEGIN');

    await client.query('DROP TABLE IF EXISTS commission_records CASCADE');
    await client.query('DROP TABLE IF EXISTS commission_tiers CASCADE');
    await client.query('DROP TABLE IF EXISTS referral_relationships CASCADE');
    await client.query('DROP TABLE IF EXISTS referral_codes CASCADE');

    await client.query('COMMIT');

    console.log('✅ 旧表已删除');
    console.log('🔄 重新运行迁移008...');

    // 重新导入并执行迁移
    const { up } = await import('./008-referral-system.js');
    await up();

    console.log('✅ 邀请系统表已重建完成');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 重置失败:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

resetReferralTables();
