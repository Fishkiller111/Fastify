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

### Initial Setup
```bash
cp .env.template .env  # Create environment file from template
# Edit .env with your database credentials and JWT secret
npm install            # Install dependencies (uses pnpm)
npm run build          # Compile TypeScript
npm run migrate        # Initialize database schema
npm run dev            # Start development server
```

### Environment Variables
Required configuration in `.env` file:
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Server
PORT=7000
HOST=0.0.0.0

# Redis (Optional - for caching)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Frontend URL (for referral links)
FRONTEND_URL=http://localhost:3000

# Aliyun SMS (Optional - for SMS verification)
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_SMS_SIGN_NAME=your_sms_sign_name
ALIYUN_SMS_TEMPLATE_CODE=your_sms_template_code
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
├── config/           # Environment and database configuration (database, redis, index)
├── migrations/       # Database schema migrations (sequential numbering)
├── modules/          # Feature modules (modular architecture)
│   ├── auth/        # Authentication (email, SMS, wallet login)
│   ├── user/        # User profile and betting history
│   ├── meme/        # Meme token prediction events
│   ├── mainstream/  # Mainstream coin price prediction
│   ├── kline/       # K-line data and WebSocket
│   ├── referral/    # Referral codes and commission system
│   ├── verification/# SMS verification
│   ├── sms/         # Aliyun SMS service
│   └── config/      # Dynamic configuration storage
├── plugins/          # Fastify plugins (JWT, authentication middleware)
├── routes/           # Route registration and organization
├── scripts/          # Utility scripts (SMS config initialization)
└── server.ts         # Application entry point
```

### Module Pattern
Each module follows this structure:
- `routes.ts` - HTTP endpoints and request/response handling
- `service.ts` - Business logic and database operations
- `types.ts` - TypeScript interfaces and type definitions
- `websocket.ts` (optional) - WebSocket handlers for real-time features

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
   - WebSocket plugin (`@fastify/websocket`) - must be first for real-time features
   - CORS plugin
   - Swagger & Swagger UI plugins
   - JWT plugin (`src/plugins/jwt.ts`)
   - Auth plugin (`src/plugins/auth.ts`) - must come after JWT
   - All route modules via `src/routes/index.ts`
3. **Route Prefixes**: All API routes mounted under `/api/*` (e.g., `/api/auth`, `/api/user`, `/api/admin/users`)
4. **Startup Tasks**: Auto-settlement cron job starts automatically via `startAutoSettleJob()` in `src/server.ts`

### API Documentation
- **Swagger UI**: Available at `/docs` when server is running
- **OpenAPI**: Configured with JWT bearer authentication scheme
- **Schema Validation**: Routes include JSON schema for request/response validation

### Configuration Management
- **Environment**: Uses `dotenv` with `.env` file
- **Structure**: Centralized config in `src/config/index.ts`
- **Key Settings**: Database connection, JWT secret, server host/port, Redis connection, frontend URL

#### Redis Integration
- **Purpose**: Caching, session management, and real-time data storage
- **Configuration**: `src/config/redis.ts` with connection pooling and retry strategy
- **Environment Variables**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- **Connection Management**: Auto-reconnect with exponential backoff (max 2 seconds delay)
- **Event Monitoring**: Console logging for connect, error, and close events

### Database Schema
- **Users**: Authentication, profile data, role-based access control (RBAC)
  - Supports email, SMS, and wallet-based login
  - Fields: email, phone, wallet_address, password, role, permissions, status, balance
- **Config**: Key-value storage for application configuration
  - Used for login method configuration and third-party service credentials
  - Examples: login_method, aliyun_sms_* settings
- **Meme Events** (`meme_events`): Unified prediction market events table
  - Supports three event types: `pumpfun`, `bonk`, `Mainstream`
  - **Common fields**: type, contract_address, creator_side, pools, odds, status, deadline
  - **Mainstream-specific**: big_coin_id, future_price, current_price
  - States: pending_match → active → settled
  - See MEME_FLOW.md for detailed business logic
- **Big Coins** (`big_coins`): Supported major cryptocurrencies for mainstream events
  - Fields: symbol, name, contract_address, chain (BSC), decimals, is_active, icon_url
  - Used by mainstream events to reference supported coins
  - icon_url: Optional URL field for cryptocurrency icon images (max 500 chars)
- **Meme Bets** (`meme_bets`): User betting records with potential and actual payouts
  - Unified table for both meme and mainstream event bets
- **Event Klines** (`klines`): Historical odds snapshots for K-line chart visualization
  - Timestamp-based records with yes_odds, no_odds, pools, total_bets
- **Referral System Tables** (Migration 008):
  - **referral_codes**: User-generated invitation codes (8-char alphanumeric, unique)
  - **referral_relationships**: Tracks inviter-invitee relationships (one invitee per inviter)
  - **commission_tiers**: Tiered commission structure based on trading volume
    - Default tiers: CipherSignal (1%), ShadowTact (1.5%), MajorWin (2%), SealOracle (2.5%)
  - **commission_records**: Commission tracking with pending/settled/cancelled states
- **Migrations**: Version-controlled schema changes with sequential numbering
  - Latest: 009-create-kline-buy-records.ts

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

### Role-Based Access Control (RBAC)
The system supports two admin role levels:
- **`user`**: Regular users with basic authentication
- **`admin`**: Administrators requiring specific permissions (e.g., `meme.delete`, `mainstream.delete`)
- **`super_admin`**: Super administrators with highest privileges, bypasses all permission checks

**Permission Logic**:
- `super_admin` has unrestricted access to all admin routes
- `admin` requires specific permissions defined in the `permissions` array
- Permission check happens in `src/plugins/auth.ts` adminAuth middleware

### ES Modules & TypeScript Configuration
- All imports must use `.js` extensions even for TypeScript files
- TypeScript compiles to ES modules in `dist/` directory
- Package.json has `"type": "module"` configuration
- **Path Aliases**: `@/*` maps to `src/*` (configured in `tsconfig.json`)
  - Note: Path aliases work during development but TypeScript doesn't transform them in output
  - If using path aliases in production, consider using a bundler or path rewriting tool

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

## Prediction Market System

This API includes two prediction market types. See **MEME_FLOW.md** for detailed business logic.

### 1. Meme Token Launch Events (`pumpfun`, `bonk`)
Predict whether a meme token will successfully launch on specific platforms.

#### State Machine
Events transition: `pending_match` → `active` → `settled`
- **pending_match**: Creator's side funded, waiting for counter-bets
- **active**: Both sides have bets, countdown to deadline begins
- **settled**: Result determined via DexScreener API, payouts distributed

#### Settlement Logic
- **pumpfun**: Success if on `pumpswap`, failure if on `pumpfun`
- **bonk**: Success if on `raydium`, failure if on `launchlab`
- Uses `src/modules/meme/token-service.ts` `checkTokenLaunchStatus()` function

### 2. Mainstream Coin Price Events (`Mainstream`)
Predict whether a major cryptocurrency will reach a target price by deadline.

#### Key Features
- **Contract Source**: Uses `big_coins` table for supported coins (BSC chain)
- **Target Price**: User specifies `future_price` when creating event
- **Price Oracle**: DexScreener API queries BSC chain token prices
- **Settlement**: Compares `current_price >= future_price` at deadline

#### Critical Implementation
```typescript
// Creating mainstream event
{
  "type": "Mainstream",
  "big_coin_id": 1,              // References big_coins table
  "future_price": 50000,         // Target price in USD
  "creator_side": "yes",         // yes = will reach, no = won't reach
  "initial_pool_amount": 100,
  "duration": "1days"
}
```

#### BSC Price Query
- Function: `fetchBSCTokenPrice()` in `src/modules/mainstream/service.ts`
- API: `https://api.dexscreener.com/latest/dex/tokens/{address}`
- Filters: `chainId === 'bsc'` or `'binance'`
- Returns: USD price from first matching pair

### Shared Architecture Patterns

#### Dynamic Odds Calculation
Odds recalculate after each bet based on pool ratios:
```typescript
YES_odds = (NO_pool / total_pool) × 100
NO_odds = (YES_pool / total_pool) × 100
```

#### Real-time Updates via WebSocket
- **Connection**: `ws://host/ws/kline/events/{eventId}?interval=1m&source=pumpfun`
- **Manager**: `src/modules/kline/websocket.ts` - WebSocketManager class
- **Broadcasting**: Automatic odds updates and bet records after each bet
- **Message Types**:
  - `historical`: Initial historical odds data for chart rendering
  - `current`: Current real-time odds snapshot
  - `bet_placed`: Real-time user bet records broadcast
  - `odds_update`: Updated odds after betting activity
  - `pong`: Heartbeat response
- **Test Page**: `test-kline.html` provides complete WebSocket testing interface

#### Settlement & Payout
- **Trigger**: Auto-settlement via cron job (every minute) or manual admin trigger
- **Payout Formula**: `user_payout = (user_bet / winning_pool) × total_pool`
- **Transaction Safety**: All operations wrapped in database transactions

#### Auto-Settlement System
- **Location**: `src/modules/meme/auto-settle.ts`
- **Schedule**: Cron job runs every minute via `node-cron`
- **Startup**: Auto-starts in `src/server.ts` via `startAutoSettleJob()`
- **Process**:
  1. Queries all events where `status = 'active' AND deadline <= NOW()`
  2. For meme events: Calls `checkTokenLaunchStatus()`
  3. For mainstream events: Calls `settleMainstreamEvent()`
  4. Distributes payouts to winners
  5. Logs detailed settlement information

#### K-line Data Recording
- **Purpose**: Historical odds tracking for chart visualization
- **Storage**: `klines` table with timestamp-based records
- **Timing**: After transaction commit to avoid deadlocks
- **Pattern**: K-line recording moved outside database transactions
- **Non-blocking**: Uses try-catch to prevent K-line failures from affecting main flow

### Critical Implementation Details

#### Duration Parsing
Supports flexible time formats in event creation:
- Minutes: "10minutes", "30minutes"
- Hours: "5hours", "24hours"
- Days: "1days", "7days"
- Short forms: "10m", "5h", "2d"

#### Deadline After Settlement
API responses include `deadline_after_settlement` field:
- For active events: returns `deadline`
- For settled events: returns actual `settled_at` timestamp

#### Matching Mechanism
In `pending_match` state, only counter-side bets allowed:
- Creator bets YES → only NO bets accepted
- First counter-bet triggers state change to `active`

#### Transaction Best Practices
**Critical Pattern**: K-line recording and WebSocket broadcasting must occur AFTER transaction commit:

```typescript
await client.query('COMMIT');

// K-line recording (outside transaction, non-blocking)
try {
  await EventKlineService.recordOddsSnapshot(eventId);
} catch (klineError) {
  console.error('K线数据记录失败:', klineError);
}

// WebSocket broadcasting (non-blocking)
wsManager.broadcast(eventId).catch(err => {
  console.error('WebSocket广播失败:', err);
});
```

**Why**: Recording K-lines inside transactions can cause deadlocks when multiple bets happen simultaneously. Always commit first, then record K-lines.

## User Statistics & Betting History

### User Bet Records Endpoint
**GET /api/user/bets/all** - Retrieves all user betting records across all event types (pumpfun, bonk, Mainstream)

**Features**:
- Unified query across both meme and mainstream events
- Includes full event details in response
- Supports pagination with `limit` and `offset` parameters
- Returns big_coin information for mainstream events (symbol, name, icon_url)
- Requires JWT authentication via `userAuth()` middleware

**Response Structure**:
```typescript
{
  id: number;
  event_id: number;
  bet_type: 'yes' | 'no';
  bet_amount: string;
  odds_at_bet: string;
  potential_payout: string | null;
  actual_payout: string | null;
  status: 'pending' | 'won' | 'lost' | 'refunded';
  created_at: string;
  event: {
    type: 'pumpfun' | 'bonk' | 'Mainstream';
    status: string;
    // Mainstream-specific fields
    big_coin_symbol?: string;
    big_coin_name?: string;
    big_coin_icon_url?: string;
    future_price?: string;
    current_price?: string;
  }
}
```

### User Statistics Endpoint
**GET /api/user/statistics** - Provides comprehensive user betting statistics with time range filtering

**Query Parameters**:
- `time_range`: Optional filter for time period
  - `1d` - Last 24 hours
  - `1w` - Last 7 days
  - `1m` - Last 30 days (default)
  - `all` - All time

**Calculated Metrics**:
- **total_bets**: Total number of bets placed
- **total_bet_amount**: Sum of all bet amounts
- **active_bet_amount**: Sum of bets with `status = 'pending'` (excludes settled/cancelled)
- **profit**: Sum of (actual_payout - bet_amount) for won bets
- **loss**: Sum of bet_amount for lost bets
- **net_profit**: profit - loss
- **win_rate**: Percentage of won bets among settled bets

**Implementation Details**:
- Uses PostgreSQL INTERVAL syntax for time filtering
- COALESCE for null safety in aggregate calculations
- Only pending bets count towards active_bet_amount
- Time filtering based on `created_at` field
- Response includes `time_range` field showing queried period

**SQL Pattern**:
```sql
SELECT
  COUNT(*) as total_bets,
  COALESCE(SUM(CASE WHEN status = 'pending' THEN bet_amount ELSE 0 END), 0) as active_bet_amount,
  COALESCE(SUM(CASE WHEN status = 'won' THEN (actual_payout - bet_amount) ELSE 0 END), 0) as profit
FROM meme_bets
WHERE user_id = $1
  AND created_at >= NOW() - INTERVAL '7 days'  -- for time_range='1w'
```

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

## WebSocket Real-Time Features

### WebSocket Bet Broadcasting
When users place bets, the system broadcasts two types of messages:
1. **`bet_placed`**: Real-time bet record with user_id, bet_type, bet_amount, odds_at_bet, potential_payout, timestamp
2. **`odds_update`**: Updated odds after the bet is processed

**Implementation Location**: `src/modules/kline/websocket.ts`

**Broadcast Methods**:
- `broadcastBet(eventId, betData)`: Sends bet records to all subscribed clients
- `broadcast(eventId)`: Sends odds updates to all subscribed clients

**Frontend Integration**:
```javascript
const ws = new WebSocket('ws://localhost:7000/ws/kline/events/1?interval=1m&source=pumpfun');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch(message.type) {
    case 'bet_placed':
      // Handle new bet record
      // Display in bet list, update statistics
      break;
    case 'odds_update':
      // Update odds display and charts
      break;
  }
};
```

**WebSocket Documentation Endpoint**: `GET /api/kline/websocket-docs` returns complete WebSocket API documentation with examples

## Administrative Operations

### Delete Settled Events
Two endpoints for cleaning up settled prediction market events:

**Meme Events**: `DELETE /api/meme/events/settled`
- Deletes all settled meme events (pumpfun, bonk)
- Cascades to meme_bets and klines tables
- Requires `super_admin` role or `admin` with `meme.delete` permission

**Mainstream Events**: `DELETE /api/mainstream/events/settled`
- Deletes all settled mainstream coin events
- Cascades to meme_bets and klines tables
- Requires `super_admin` role or `admin` with `mainstream.delete` permission

**Response Format**:
```json
{
  "deletedCount": 5,
  "message": "成功删除 5 个已结算的Meme事件及其关联数据"
}
```

**Implementation**: Uses database transactions to ensure data integrity during cascade deletion

## Referral & Commission System

This API includes a comprehensive referral system with tiered commissions based on trading volume.

### System Architecture

#### Invitation Flow
1. **Generate Referral Code**: User generates unique 8-character alphanumeric code
2. **Share Code**: Inviter shares code with potential invitees
3. **Code Validation**: System validates code during registration/first bet
4. **Relationship Creation**: Creates inviter-invitee relationship (one-to-one)
5. **Commission Tracking**: Automatically tracks commissions on invitee's bets

#### Commission Tiers
Trading volume-based tier system with automatic progression:
- **CipherSignal**: $0+ volume → 1% commission
- **ShadowTact**: $50,000+ volume → 1.5% commission
- **MajorWin**: $250,000+ volume → 2% commission
- **SealOracle**: $500,000+ volume → 2.5% commission

**Tier Calculation**: Based on cumulative trading volume of all invitees

### Key Service Methods

#### Referral Code Management
**Location**: `src/modules/referral/service.ts`

```typescript
// Generate or retrieve user's referral code
ReferralService.generateReferralCode(userId: number): Promise<ReferralCode>

// Validate referral code
ReferralService.validateReferralCode(code: string): Promise<ReferralCode | null>

// Activate referral relationship
ReferralService.activateReferral(inviteeId: number, code: string): Promise<ReferralRelationship>
```

#### Commission Operations
```typescript
// Record commission when invitee places bet
ReferralService.recordCommission(
  inviteeId: number,
  betId: number,
  betAmount: number
): Promise<CommissionRecord | null>

// Settle commission when bet event is settled
ReferralService.settleCommission(betId: number): Promise<void>
```

#### Statistics & Reporting
```typescript
// Get comprehensive referral statistics
ReferralService.getReferralStatistics(userId: number): Promise<ReferralStatistics>

// Get list of invitees with their betting activity
ReferralService.getInviteesList(
  inviterId: number,
  limit?: number,
  offset?: number
): Promise<Array<InviteeInfo>>

// Get commission records
ReferralService.getCommissionRecords(
  inviterId: number,
  limit?: number,
  offset?: number
): Promise<CommissionRecord[]>
```

### API Endpoints

**User Endpoints** (`/api/referral/*`):
- `POST /code` - Generate or retrieve referral code
- `GET /code` - Get user's referral code
- `POST /activate` - Activate referral relationship with code
- `GET /statistics` - Get referral statistics (invitees, volume, commissions, tier progress)
- `GET /invitees` - List all invitees with their betting activity
- `GET /commissions` - List commission records with pagination

**Admin Endpoints** (`/api/admin/referral/*`):
- `GET /tiers` - Get all commission tiers
- `POST /tiers` - Create new commission tier
- `PUT /tiers/:id` - Update commission tier configuration
- `DELETE /tiers/:id` - Delete commission tier

### Integration Points

#### Registration/Login Integration
Referral code can be provided during:
- User registration (any login method)
- First bet placement (if not set during registration)

#### Betting Flow Integration
When invitee places a bet:
1. **Record Commission**: `ReferralService.recordCommission()` called in bet service
2. **Commission State**: Creates `pending` commission record
3. **Tier Calculation**: Uses current tier based on inviter's total volume
4. **Amount Calculation**: `commission_amount = bet_amount × commission_rate`

#### Settlement Flow Integration
When bet event is settled:
1. **Trigger**: Auto-settlement system or manual admin settlement
2. **Commission Settlement**: `ReferralService.settleCommission()` called
3. **Balance Update**: Adds commission to inviter's balance
4. **State Change**: Commission record status: `pending` → `settled`

### Critical Business Rules

**Referral Code Constraints**:
- One active code per user
- 8-character alphanumeric format
- Uniqueness enforced at database level
- Cannot use own referral code

**Relationship Constraints**:
- One invitee can only be invited by one inviter
- Relationship is permanent (no deletion)
- Activation timestamp tracked for analytics

**Commission Rules**:
- Commission calculated at bet placement time using current tier
- Commission rate locked when bet is placed
- Tier progression affects future bets, not past ones
- Volume aggregated across all invitees for tier calculation

### Environment Configuration
Add to `.env.template`:
```bash
# 前端URL配置 (用于生成邀请链接)
FRONTEND_URL=http://localhost:3000
```

**Invitation Link Format**: `${FRONTEND_URL}/register?ref=${referral_code}`