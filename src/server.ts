import Fastify from "fastify";
import config from "./config/index.ts";
import jwtPlugin from "./plugins/jwt.ts";
import authPlugin from "./plugins/auth.ts";
import registerRoutes from "./routes/index.ts";
// src/server.js
import { inspect } from "node:util";

process.on("uncaughtException", (err) => {
  console.error("❌ uncaughtException");
  console.error(inspect(err, { depth: null, colors: true }));
  console.error(new Error().stack); // 打印 JS 栈，方便定位
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ unhandledRejection");
  console.error(inspect(reason, { depth: null, colors: true }));
  console.error(new Error().stack);
  process.exit(1);
});
// 创建启动函数，避免顶层await
async function startServer() {
  // 创建Fastify实例
  const app = Fastify({ logger: true });

  // 注册Swagger插件
  await app.register(import("@fastify/swagger"), {
    openapi: {
      info: {
        title: "Fastify API",
        description: "Fastify API documentation",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://${config.server.host}:${config.server.port}`,
          description: "Development server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  // 注册Swagger UI插件
  await app.register(import("@fastify/swagger-ui"), {
    routePrefix: "/docs",
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
  app.get("/", async () => {
    return { message: "Hello Fastify!" };
  });

  // 启动服务器
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    console.log(
      `服务器运行在 http://${config.server.host}:${config.server.port}`
    );
    console.log(
      `API文档地址: http://${config.server.host}:${config.server.port}/docs`
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// 启动服务器
startServer();

// 注意：为避免循环依赖，我们不导出app实例
