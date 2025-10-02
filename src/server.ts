import fastify from 'fastify';
import config from './config/index.js';
import jwtPlugin from './plugins/jwt.js';
import authPlugin from './plugins/auth.js';
import registerRoutes from './routes/index.js';

// 创建Fastify实例
const app = fastify({ logger: true });

// 允许跨域访问（暂时放开所有域）
await app.register(import('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

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

// 启动服务器
const start = async () => {
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    console.log(`服务器运行在 http://${config.server.host}:${config.server.port}`);
    console.log(`API文档地址: http://${config.server.host}:${config.server.port}/docs`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();

export default app;
