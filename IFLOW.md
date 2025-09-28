# IFLOW.md - Fastify 后端项目上下文

## 项目概述

这是一个使用 Fastify 框架构建的 Node.js 后端项目，采用 TypeScript 编写。项目实现了基本的用户认证功能，包括用户注册、登录和 JWT 鉴权。同时集成了 Swagger API 文档，方便 API 的测试和文档化。

主要技术栈：
- Fastify: 高性能的 Node.js Web 框架
- TypeScript: JavaScript 的超集，提供类型安全
- PostgreSQL: 关系型数据库
- JWT: JSON Web Token 实现用户认证
- Swagger: API 文档生成工具
- bcrypt: 密码加密库
- jsonwebtoken: JWT 令牌生成和验证库

## 项目结构

```
.
├── src/
│   ├── config/          # 配置文件
│   ├── modules/         # 功能模块
│   │   ├── auth/        # 认证模块
│   │   └── user/        # 用户模块
│   ├── plugins/         # Fastify 插件
│   ├── routes/          # 路由注册
│   ├── migrations/      # 数据库迁移脚本
│   └── server.ts        # 应用入口文件
├── dist/                # 编译后的 JavaScript 文件
├── node_modules/        # 依赖包
├── .env                 # 环境变量配置文件
├── package.json         # 项目配置和依赖
└── tsconfig.json        # TypeScript 配置
```

## 核心功能

### 认证模块
- 用户注册 (POST /api/auth/register)
- 用户登录 (POST /api/auth/login)
- JWT 令牌生成和验证
- 密码加密存储 (bcrypt)

### 用户模块
- 获取当前用户信息 (GET /api/user/me)
- JWT 认证保护

### API 文档
- Swagger UI 访问地址: http://localhost:3000/docs
- OpenAPI 3.0 规范
- 自动生成的交互式 API 文档

## 环境配置

项目使用 `.env` 文件进行环境配置，主要配置项包括：
- 服务器端口和主机地址
- PostgreSQL 数据库连接信息
- JWT 密钥和过期时间

## 构建和运行

### 开发环境
```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

### 生产环境
```bash
# 编译 TypeScript 代码
pnpm build

# 启动生产服务器
pnpm start
```

### 数据库迁移
```bash
# 运行数据库迁移
pnpm migrate
```

## 开发约定

1. 使用 TypeScript 编写代码，确保类型安全
2. 遵循模块化设计，将相关功能组织在对应的模块中
3. 使用环境变量管理配置信息
4. API 路由需要定义 Swagger schema 以便生成文档
5. 数据库操作使用 PostgreSQL
6. 使用 ES 模块系统 (ESM)
7. 所有导入路径需要包含文件扩展名 (.js)
8. JWT 令牌使用 jsonwebtoken 库生成和验证
9. 密码使用 bcrypt 进行加密存储

## 技术细节

### 模块系统
项目现在使用 ES2022 模块系统，需要在所有导入语句中包含文件扩展名。

### JWT 实现
JWT 令牌现在使用 jsonwebtoken 库直接生成，而不是依赖 Fastify 的 JWT 插件。

### 数据库连接
使用 pg 库的连接池管理 PostgreSQL 数据库连接。

### 密码安全
用户密码使用 bcrypt 进行加密存储，确保安全性。