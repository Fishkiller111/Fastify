import { up as initCompleteDatabase } from './001-init-complete-database.js';

// 运行完整数据库初始化迁移
async function runMigrations() {
  try {
    console.log('🚀 开始运行完整数据库迁移...');

    // 运行完整数据库初始化（包含所有表和配置）
    await initCompleteDatabase();

    console.log('🎉 完整数据库迁移已完成');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ 迁移过程中发生错误:', err);
    console.error('详细错误信息:', err.message);
    if (err.stack) {
      console.error('错误堆栈:', err.stack);
    }
    process.exit(1);
  }
}

runMigrations();