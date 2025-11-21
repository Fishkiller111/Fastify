import { FastifyInstance } from 'fastify';
import AdminJS from 'adminjs';
import AdminJSFastify from '@adminjs/fastify';
import Adapter, { Database, Resource } from '@adminjs/sql';
import config from '../config/index.js';

// 简单版 Admin 面板插件：不做多语言、不注入自定义脚本，保持 AdminJS 原生样式
async function simpleAdminPanelPlugin(fastify: FastifyInstance) {
  // 注册 SQL 适配器
  AdminJS.registerAdapter({ Database, Resource });

  const dbConfig = config.database;
  const password = encodeURIComponent(dbConfig.password || '');
  const connectionString = `postgresql://${dbConfig.user}:${password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;

  // 初始化 SQL 适配器
  const adapter = new Adapter('postgresql', {
    connectionString,
    database: dbConfig.database,
  });

  const db = await adapter.init();

  const adminOptions: any = {
    rootPath: '/admin',
    resources: [
      // 用户表：用户管理、余额、角色等（导航名称保留中文，其余显示用 AdminJS 默认英文）
      {
        resource: db.table('users'),
        options: {
          navigation: { name: '用户管理', icon: 'User' },
          icon: 'User',
          properties: {
            password: { isVisible: false },
          },
          listProperties: [
            'id',
            'username',
            'email',
            'wallet_address',
            'balance',
            'role',
            'status',
            'created_at',
          ],
          editProperties: [
            'username',
            'email',
            'phone_number',
            'wallet_address',
            'balance',
            'role',
            'status',
          ],
        },
      },
      // 反佣等级配置
      {
        resource: db.table('commission_tiers'),
        options: {
          navigation: { name: '返佣配置', icon: 'Settings' },
          icon: 'Settings',
          listProperties: ['id', 'tier_name', 'volume', 'commission_rate', 'tier_order', 'is_active'],
          sort: {
            sortBy: 'tier_order',
            direction: 'asc',
          },
        },
      },
      // 充值订单（只读）
      {
        resource: db.table('payment_orders'),
        options: {
          navigation: { name: '资金与订单', icon: 'CurrencyDollar' },
          icon: 'CurrencyDollar',
          actions: {
            new: { isAccessible: false },
            edit: { isAccessible: false },
            delete: { isAccessible: false },
          },
          listProperties: [
            'id',
            'user_id',
            'order_id',
            'trade_id',
            'amount_cny',
            'actual_amount',
            'status',
            'created_at',
          ],
        },
      },
      // 主流币 / Meme 合约相关基础表
      {
        resource: db.table('big_coins'),
        options: {
          navigation: { name: '合约管理', icon: 'Database' },
          icon: 'Database',
          listProperties: ['id', 'symbol', 'name', 'contract_address', 'chain', 'is_active'],
        },
      },
      {
        resource: db.table('meme_events'),
        options: {
          navigation: { name: '合约事件', icon: 'DocumentSearch' },
          icon: 'DocumentSearch',
          listProperties: [
            'id',
            'type',
            'creator_id',
            'contract_address',
            'big_coin_id',
            'status',
            'deadline',
            'created_at',
          ],
          filterProperties: ['type', 'status', 'big_coin_id'],
          actions: {
            new: { isAccessible: false },
            delete: { isAccessible: false },
          },
        },
      },
      {
        resource: db.table('meme_bets'),
        options: {
          navigation: { name: '合约下注', icon: 'DocumentCheck' },
          icon: 'DocumentCheck',
          listProperties: [
            'id',
            'event_id',
            'user_id',
            'bet_type',
            'bet_amount',
            'status',
            'created_at',
          ],
          actions: {
            new: { isAccessible: false },
            edit: { isAccessible: false },
            delete: { isAccessible: false },
          },
        },
      },
    ],
    branding: {
      companyName: 'Meme Admin Panel',
      logo: false,
      withMadeWithLove: false,
    },
  };

  const admin = new AdminJS(adminOptions);

  // 开发环境下启用 AdminJS watch，方便调试
  if (process.env.NODE_ENV !== 'production') {
    try {
      // @ts-ignore - watch 在部分类型定义中可能缺失
      admin.watch?.();
    } catch {
      // ignore
    }
  }

  // 将 AdminJS 挂到 /admin，并用 adminAuth 保护
  await fastify.register(async (instance) => {
    instance.addHook('onRequest', instance.adminAuth());
    await AdminJSFastify.buildRouter(admin, instance as any);
  });
}

export default simpleAdminPanelPlugin;
