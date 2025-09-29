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

#### JWT Authentication
- **Plugin Location**: `src/plugins/jwt.ts`
- **Critical Note**: Due to Fastify's plugin encapsulation, JWT verification in routes must use direct `jsonwebtoken` library calls rather than `fastify.authenticate` decorator
- **Pattern**: Routes import `jwt` and `config` directly for token verification

#### Database Layer
- **Connection**: PostgreSQL with `pg` driver
- **Configuration**: `src/config/database.ts` and `src/config/index.ts`
- **Migrations**: Located in `src/migrations/` with sequential numbering
- **Pattern**: Services handle all database operations, routes handle HTTP concerns

#### Module Registration
1. **Server Setup**: `src/server.ts` registers plugins and routes
2. **Route Registration**: `src/routes/index.ts` registers all module routes with prefixes
3. **Plugin Order**: JWT plugin must be registered before routes that use authentication

### API Documentation
- **Swagger UI**: Available at `/docs` when server is running
- **OpenAPI**: Configured with JWT bearer authentication scheme
- **Schema Validation**: Routes include JSON schema for request/response validation

### Configuration Management
- **Environment**: Uses `dotenv` with `.env` file
- **Structure**: Centralized config in `src/config/index.ts`
- **Key Settings**: Database connection, JWT secret, server host/port

### Database Schema
- **Users**: Authentication and profile data
- **Config**: Application configuration storage
- **Migrations**: Version-controlled schema changes

## Important Implementation Notes

### JWT Authentication Gotchas
- **Do NOT use** `fastify.authenticate` decorator in routes - it won't work due to plugin encapsulation
- **DO use** direct `jwt.verify()` calls with `config.jwt.secret` in route `preHandler` functions
- **Pattern**: Import `jsonwebtoken` and verify tokens manually in each protected route

### ES Modules
- All imports must use `.js` extensions even for TypeScript files
- TypeScript compiles to ES modules in `dist/` directory
- Package.json has `"type": "module"` configuration

### Database Migrations
- Run in sequence using `npm run migrate`
- Each migration is numbered (001, 002, 003, etc.)
- Migration runner tracks completed migrations to avoid re-execution

### Error Handling
- Routes should handle errors gracefully with appropriate HTTP status codes
- Database errors should be caught and translated to user-friendly messages
- JWT verification errors should return 401 with consistent error format

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