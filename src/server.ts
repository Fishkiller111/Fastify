import fastify from 'fastify';
import config from './config/index.js';
import jwtPlugin from './plugins/jwt.js';
import authPlugin from './plugins/auth.js';
import registerRoutes from './routes/index.js';
import { aiConfigService } from './modules/ai/config-service.js';

// 创建Fastify实例
const app = fastify({ logger: true });

// 注册Swagger插件
await app.register(import('@fastify/swagger'), {
  openapi: {
    info: {
      title: 'Fastify API',
      description: 'Fastify API documentation',
      version: '1.0.0',
    },
    servers: [{
      url: `http://${config.server.host}:${config.server.port}`,
      description: 'Development server'
    }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
});

// 注册Swagger UI插件
await app.register(import('@fastify/swagger-ui'), {
  routePrefix: '/docs',
  uiConfig: {
    deepLinking: false,
    defaultModelsExpandDepth: -1, // 不显示Models
  },
  staticCSP: true,
});

// 注册JWT插件
await app.register(jwtPlugin);

// 注册认证插件
await app.register(authPlugin);

// 注册路由
app.register(registerRoutes);

// 根路由
app.get('/', async () => {
  return { message: 'Hello Fastify!' };
});

// AI模块初始化
const initializeAI = async () => {
  try {
    console.log('🤖 初始化AI模块...');
    const aiConfig = await aiConfigService.getAIConfig();
    const provider = aiConfig.provider;

    let currentConfig: any = {};
    switch (provider) {
      case 'openai':
        currentConfig = aiConfig.openai;
        break;
      case 'claude':
        currentConfig = aiConfig.claude;
        break;
      case 'openrouter':
        currentConfig = aiConfig.openrouter;
        break;
    }

    console.log(`✅ AI模块初始化完成:`);
    console.log(`   📋 提供商: ${provider.toUpperCase()}`);
    console.log(`   🎛️  参数: maxTokens=${aiConfig.maxTokens}, temperature=${aiConfig.temperature}`);
    console.log(`   📡 API状态: http://${config.server.host}:${config.server.port}/api/ai/status`);
  } catch (error) {
    console.log(`⚠️  AI模块初始化失败: ${error}，将使用默认配置`);
  }
};

// 启动服务器
const start = async () => {
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    console.log(`服务器运行在 http://${config.server.host}:${config.server.port}`);
    console.log(`API文档地址: http://${config.server.host}:${config.server.port}/docs`);

    // 初始化AI模块
    await initializeAI();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();

export default app;