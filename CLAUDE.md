# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
```bash
npm run build          # Compile TypeScript to JavaScript
npm start              # Start the production server (requires build first)
npm run dev            # Start development server with hot reload
npm run migrate        # Run database migrations
```

### Database Operations
```bash
npm run migrate        # Run all migrations in sequence
node dist/scripts/init-sms-config.js  # Initialize SMS configuration
```

## Architecture Overview

This is a **Fastify-based REST API** with TypeScript, JWT authentication, and PostgreSQL database.

### Core Architecture Pattern
- **Modular Structure**: Each feature is organized as a module with routes, services, and types
- **Plugin-based**: Uses Fastify's plugin system for JWT, Swagger, and other features
- **ES Modules**: Uses ES2022 modules with `.js` imports (TypeScript compilation target)

### Directory Structure
```
src/
├── config/           # Environment and database configuration
├── migrations/       # Database schema migrations
├── modules/          # Feature modules (auth, user, verification, sms, config)
├── plugins/          # Fastify plugins (JWT authentication)
├── routes/           # Route registration and organization
├── scripts/          # Utility scripts
└── server.ts         # Application entry point
```

### Module Pattern
Each module follows this structure:
- `routes.ts` - HTTP endpoints and request/response handling
- `service.ts` - Business logic and database operations
- `types.ts` - TypeScript interfaces and type definitions

### Key Architectural Components

#### JWT Authentication System
- **JWT Plugin**: `src/plugins/jwt.ts` - Registers @fastify/jwt for token generation
- **Auth Plugin**: `src/plugins/auth.ts` - Provides `userAuth()` and `adminAuth()` middleware decorators
- **Critical Pattern**: Use `fastify.userAuth()` or `fastify.adminAuth()` in route `preHandler` hooks
- **Implementation Details**:
  - Middleware validates JWT, checks user status, and verifies permissions
  - User info attached to `request.user` or `request.admin` after successful authentication
  - Supports role-based access control (RBAC) with permission checking
  - Admin routes require `role === 'admin'` in addition to valid JWT

#### Database Layer
- **Connection**: PostgreSQL with `pg` driver
- **Configuration**: `src/config/database.ts` and `src/config/index.ts`
- **Migrations**: Located in `src/migrations/` with sequential numbering
- **Pattern**: Services handle all database operations, routes handle HTTP concerns

#### Module Registration & Plugin Order
1. **Server Setup**: `src/server.ts` is the entry point
2. **Plugin Registration Order** (critical):
   - CORS plugin
   - Swagger & Swagger UI plugins
   - JWT plugin (`src/plugins/jwt.ts`)
   - Auth plugin (`src/plugins/auth.ts`) - must come after JWT
   - All route modules via `src/routes/index.ts`
3. **Route Prefixes**: All API routes mounted under `/api/*` (e.g., `/api/auth`, `/api/user`, `/api/admin/users`)

### API Documentation
- **Swagger UI**: Available at `/docs` when server is running
- **OpenAPI**: Configured with JWT bearer authentication scheme
- **Schema Validation**: Routes include JSON schema for request/response validation

### Configuration Management
- **Environment**: Uses `dotenv` with `.env` file
- **Structure**: Centralized config in `src/config/index.ts`
- **Key Settings**: Database connection, JWT secret, server host/port

### Database Schema
- **Users**: Authentication, profile data, role-based access control (RBAC)
  - Supports email, SMS, and wallet-based login
  - Fields: email, phone, wallet_address, password, role, permissions, status
- **Config**: Key-value storage for application configuration
  - Used for login method configuration and third-party service credentials
  - Examples: login_method, aliyun_sms_* settings
- **Migrations**: Version-controlled schema changes with sequential numbering

## Important Implementation Notes

### Authentication Usage Pattern
```typescript
// Protected route example
fastify.get('/profile', {
  preHandler: fastify.userAuth(), // Basic authentication
  handler: async (request, reply) => {
    const userId = (request as any).user.userId;
    // Your logic here
  }
});

// Admin route with permission check
fastify.delete('/users/:id', {
  preHandler: fastify.adminAuth(['user.delete']), // Admin + permission
  handler: async (request, reply) => {
    const adminId = (request as any).admin.userId;
    // Your logic here
  }
});
```

### ES Modules
- All imports must use `.js` extensions even for TypeScript files
- TypeScript compiles to ES modules in `dist/` directory
- Package.json has `"type": "module"` configuration

### Database Migrations
- Run in sequence using `npm run migrate`
- Each migration is numbered (001, 002, 003, etc.)
- Migration runner tracks completed migrations to avoid re-execution

### Multi-Login Strategy
This API supports three authentication methods configured via the `config` table:
- **Email + Password**: Traditional authentication with bcrypt hashing
- **SMS Verification**: Uses Aliyun SMS service for OTP-based login
- **Wallet Address**: Web3 wallet-based authentication (e.g., MetaMask)
- **Hybrid**: Can enable multiple methods simultaneously

**Configuration**: `src/modules/auth/login-config.ts` manages login method settings. Initialize with:
```bash
node dist/scripts/init-sms-config.js
```

### Error Handling Conventions
- Authentication errors: `401` with `{ statusCode, error, message }` format
- Permission errors: `403 Forbidden`
- Validation errors: `400 Bad Request`
- Database errors: Caught in services, translated to user-friendly messages

## Template Package Architecture

This repository serves dual purposes:
1. **Working Fastify API**: Complete API implementation ready for development
2. **NPM Template Package**: Published as `fastify-fast-dev` for creating new projects

### Template Generation System
- **Entry Point**: `bin/create-fastify-app.js` - Project generator script
- **Template Config**: `template.json` - Defines template variables and exclusions
- **Environment Template**: `.env.template` - Environment variables with placeholder substitution
- **Setup Script**: `setup.js` - Legacy setup for in-place configuration

### Package Publication
- **NPM Package Name**: `fastify-fast-dev`
- **Binary Commands**: `create-fastify-api` and `fastify-fast-dev`
- **Usage**: `npx fastify-fast-dev my-project` to create new projects
- **Template Files**: Copies entire source structure excluding `node_modules`, `dist`, `.git`, and template-specific files

### Template Variable System
Variables in templates use `{{variableName}}` syntax and are replaced during project generation:
- `{{projectName}}` - Target project name
- `{{projectDescription}}` - Project description
- `{{authorName}}` and `{{authorEmail}}` - Author information
- `{{databaseName}}` - Database name (auto-generated from project name)
- `{{serverPort}}` - Server port configuration

### Development Workflow for Template Changes
When modifying the template for republishing:
1. Make changes to source files in `src/`
2. Update version in `package.json`
3. Run `npm run build` to compile TypeScript
4. Test locally with `npx . test-project` (from template directory)
5. Publish with `npm publish` (runs `prepublishOnly` hook automatically)

**Important**: Files listed in `package.json` `files` array are included in the npm package. The `bin/create-fastify-app.js` generator copies everything except items in `template.json` excludes list.