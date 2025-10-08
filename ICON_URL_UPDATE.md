# 主流币Icon URL字段更新说明

## 更新内容

为 `big_coins` 表添加 `icon_url` 字段,用于存储主流币种的图标URL地址。

## 数据库变更

### Migration 007: add-coin-icon

**文件**: `src/migrations/007-add-coin-icon.ts`

**变更内容**:
```sql
ALTER TABLE big_coins
ADD COLUMN IF NOT EXISTS icon_url VARCHAR(500);
```

**执行迁移**:
```bash
npm run build
npm run migrate
```

## API变更

### 1. POST /api/mainstream/coins (添加主流币)

**新增请求字段**:
```json
{
  "symbol": "BTC",
  "name": "Bitcoin",
  "contract_address": "0x...",
  "chain": "BSC",
  "decimals": 18,
  "is_active": true,
  "icon_url": "https://example.com/icons/btc.png"  // 新增字段
}
```

**响应新增字段**:
```json
{
  "id": 1,
  "symbol": "BTC",
  "name": "Bitcoin",
  "contract_address": "0x...",
  "chain": "BSC",
  "decimals": 18,
  "is_active": true,
  "icon_url": "https://example.com/icons/btc.png",  // 新增字段
  "created_at": "2024-10-08T12:00:00Z",
  "updated_at": "2024-10-08T12:00:00Z"
}
```

### 2. GET /api/mainstream/coins (获取主流币列表)

**响应新增字段**:
```json
[
  {
    "id": 1,
    "symbol": "BTC",
    "name": "Bitcoin",
    "contract_address": "0x...",
    "chain": "BSC",
    "decimals": 18,
    "is_active": true,
    "icon_url": "https://example.com/icons/btc.png",  // 新增字段
    "created_at": "2024-10-08T12:00:00Z",
    "updated_at": "2024-10-08T12:00:00Z"
  }
]
```

### 3. GET /api/user/bets/all (获取用户所有投注记录)

**响应中event对象新增字段**:
```json
[
  {
    "id": 1,
    "event_id": 1,
    "user_id": 1,
    "bet_type": "yes",
    "bet_amount": "100.00",
    "odds_at_bet": "1.50",
    "potential_payout": "150.00",
    "actual_payout": null,
    "status": "pending",
    "created_at": "2024-10-08T12:00:00Z",
    "event": {
      "id": 1,
      "type": "Mainstream",
      "status": "active",
      "contract_address": "0x...",
      "deadline": "2024-10-09T12:00:00Z",
      "settled_at": null,
      "token_name": null,
      "big_coin_id": 1,
      "big_coin_symbol": "BTC",
      "big_coin_name": "Bitcoin",
      "big_coin_icon_url": "https://example.com/icons/btc.png",  // 新增字段
      "future_price": "50000.00",
      "current_price": "48000.00"
    }
  }
]
```

## TypeScript类型更新

### 1. BigCoin 接口 (`src/modules/mainstream/types.ts`)

```typescript
export interface BigCoin {
  id: number;
  symbol: string;
  name: string;
  contract_address: string;
  chain: string;
  decimals: number;
  is_active: boolean;
  icon_url?: string;  // 新增字段
  created_at: Date;
  updated_at: Date;
}
```

### 2. AddBigCoinRequest 接口

```typescript
export interface AddBigCoinRequest {
  symbol: string;
  name: string;
  contract_address: string;
  chain?: string;
  decimals?: number;
  is_active?: boolean;
  icon_url?: string;  // 新增字段
}
```

### 3. UserBetWithEvent 接口 (`src/modules/meme/types.ts`)

```typescript
export interface UserBetWithEvent extends MemeBet {
  event: {
    id: number;
    type: string;
    status: MemeEventStatus;
    contract_address?: string;
    deadline: Date;
    settled_at?: Date;
    token_name?: string;
    big_coin_id?: number;
    big_coin_symbol?: string;
    big_coin_name?: string;
    big_coin_icon_url?: string;  // 新增字段
    future_price?: string;
    current_price?: string;
  };
}
```

## 代码变更文件

### 数据库迁移
- ✅ `src/migrations/007-add-coin-icon.ts` (新建)
- ✅ `src/migrations/run-migrations.ts` (更新)

### TypeScript类型定义
- ✅ `src/modules/mainstream/types.ts` (更新 BigCoin, AddBigCoinRequest)
- ✅ `src/modules/meme/types.ts` (更新 UserBetWithEvent)

### Service层
- ✅ `src/modules/mainstream/service.ts` (更新 addBigCoin 方法)
- ✅ `src/modules/user/service.ts` (更新 getAllUserBets 查询)

### Routes层
- ✅ `src/modules/mainstream/routes.ts` (更新 Swagger schema)
- ✅ `src/modules/user/routes.ts` (更新 Swagger schema)

## 测试建议

### 1. 添加主流币并指定icon_url

```bash
curl -X POST http://localhost:3000/api/mainstream/coins \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTC",
    "name": "Bitcoin",
    "contract_address": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "chain": "BSC",
    "decimals": 18,
    "is_active": true,
    "icon_url": "https://cryptoicons.org/api/icon/btc/200"
  }'
```

### 2. 查询主流币列表验证icon_url

```bash
curl http://localhost:3000/api/mainstream/coins
```

### 3. 查询用户投注记录验证icon_url

```bash
curl http://localhost:3000/api/user/bets/all \
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

## 注意事项

1. **字段可选**: `icon_url` 字段是可选的 (nullable),不影响现有功能
2. **长度限制**: URL字段最大长度为500字符
3. **向后兼容**: 已存在的主流币记录该字段为NULL,不影响使用
4. **前端展示**: 建议前端在展示币种时优先使用icon_url,如果为空则使用默认图标

## 更新日期

2024-10-08
