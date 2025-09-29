import { up as initDatabase } from './001-init-database.js';
import { up as createAIConfig } from './006-create-ai-config.js';

// 运行数据库初始化迁移
async function runMigrations() {
  try {
    console.log('🚀 开始运行数据库迁移...');
    await initDatabase();
    console.log('✅ 初始化数据库完成');

    await createAIConfig();
    console.log('✅ AI配置创建完成');

    console.log('🎉 所有迁移已完成');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ 迁移过程中发生错误:', err);
    process.exit(1);
  }
}

runMigrations();