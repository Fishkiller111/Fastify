import { up as initDatabase } from './001-init-database.js';
import { up as addBigCoins } from './002-add-big-coins.js';
import { up as addMainstreamType } from './003-add-mainstream-type.js';

// 运行数据库迁移
async function runMigrations() {
  try {
    console.log('🚀 开始运行数据库迁移...');

    // 执行所有迁移
    await initDatabase();
    await addBigCoins();
    await addMainstreamType();

    console.log('🎉 所有迁移已完成');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ 迁移过程中发生错误:', err);
    process.exit(1);
  }
}

runMigrations();
