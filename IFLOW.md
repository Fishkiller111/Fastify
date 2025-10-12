# IFLOW.md

## 项目概述

这是一个基于 Fastify 的 REST API 项目，使用 TypeScript、JWT 认证和 PostgreSQL 数据库构建。该项目提供了一个完整的用户认证系统，支持邮箱和短信两种注册/登录方式，并具有管理员功能。

### 核心技术栈

* **框架**: Fastify v5.6.1
* **语言**: TypeScript
* **认证**: JWT (JSON Web Tokens)
* **数据库**: PostgreSQL (使用 `pg` 驱动)
* **文档**: Swagger/OpenAPI (通过 `@fastify/swagger` 和 `@fastify/swagger-ui`)
* **包管理**: pnpm

### 架构模式

* **模块化结构**: 每个功能特性被组织为一个模块，包含路由(routes)、服务(service)和类型(types)。
* **插件化**: 使用 Fastify 的插件系统来管理 JWT、认证等通用功能。
* **ES 模块**: 使用 ES2022 模块，编译后的 JavaScript 文件使用 `.js` 扩展名进行导入。

### 目录结构

```
src/
├── config/           # 环境和数据库配置
├── migrations/       # 数据库模式迁移
├── modules/          # 功能模块 (auth, user, verification, sms, config, payment, points, membership)
├── plugins/          # Fastify 插件 (JWT 认证)
├── routes/           # 路由注册和组织
├── scripts/          # 工具脚本
└── server.ts         # 应用程序入口点
```

### 模块模式

每个模块遵循以下结构：
- `routes.ts` - HTTP 端点和请求/响应处理
- `service.ts` - 业务逻辑和数据库操作
- `types.ts` - TypeScript 接口和类型定义

## 构建和运行

### 开发环境

```bash
# 安装依赖
pnpm install

# 启动开发服务器 (带热重载)
pnpm run dev
```

### 生产环境

```bash
# 编译 TypeScript 到 JavaScript
npm run build

# 启动生产服务器
npm start
```

### 数据库操作

```bash
# 运行数据库迁移
npm run migrate

# 初始化短信配置
node dist/scripts/init-sms-config.js
```

### 项目生成器

该项目也作为一个 NPM 模板包发布，可用于创建新项目：

```bash
# 使用 npx 创建新项目
npx fastify-fast-dev my-project

# 或者使用 create-fastify-api 命令
npx create-fastify-api my-project
```

## 开发规范

### 代码风格

* 使用 TypeScript 进行类型安全检查。
* 遵循 ES 模块规范，所有导入必须使用 `.js` 扩展名（即使是 TypeScript 文件）。
* 使用 Fastify 的插件系统来组织代码。

### 认证

* JWT 认证通过 `src/plugins/jwt.ts` 插件实现。
* 由于 Fastify 插件封装的限制，在路由中不使用 `fastify.authenticate` 装饰器。
* 路由中通过直接调用 `jsonwebtoken` 库和 `config.jwt.secret` 来验证令牌。

### 数据库

* 使用 PostgreSQL 数据库和 `pg` 驱动。
* 数据库连接配置在 `src/config/database.ts` 和 `src/config/index.ts` 中。
* 数据库迁移位于 `src/migrations/` 目录，按顺序编号执行。
* 服务层处理所有数据库操作，路由层处理 HTTP 相关逻辑。

### 错误处理

* 路由应优雅地处理错误，并返回适当的 HTTP 状态码。
* 数据库错误应被捕获并转换为用户友好的消息。
* JWT 验证错误应返回 401 状态码和一致的错误格式。

### API 文档

* 使用 Swagger UI，可通过 `/docs` 路径访问。
* 配置了 JWT Bearer 认证方案。
* 路由包含用于请求/响应验证的 JSON 模式。

## 配置管理

* 使用 `dotenv` 管理环境变量，配置文件为 `.env`。
* 配置集中在 `src/config/index.ts` 中。
* 关键配置包括数据库连接、JWT 密钥、服务器主机/端口。

## 数据库模式

* **users**: 存储用户认证和资料数据。
* **config**: 存储应用程序配置。
* **migrations**: 通过版本控制的模式变更。