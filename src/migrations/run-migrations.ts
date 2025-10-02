import { up as initDatabase } from './001-init-database.js';
import { up as addWalletLogin } from './002-add-wallet-login.js';

// 运行数据库迁移
async function runMigrations() {
  try {
    console.log('🚀 开始运行数据库迁移...');
    await initDatabase();
    await addWalletLogin();
    console.log('🎉 所有迁移已完成');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ 迁移过程中发生错误:', err);
    process.exit(1);
  }
}

runMigrations();
