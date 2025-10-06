# 主流币时间合约 API 文档

## 概述

主流币时间合约功能允许用户对主流加密货币（BTC、ETH、SOL等）的价格走势进行预测投注。系统预置了基于BSC链的主流币合约地址。

## 数据库架构

### 新增表

#### big_coins 表
管理支持的主流币种信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| symbol | VARCHAR(20) | 币种代号（如 BTC, ETH） |
| name | VARCHAR(100) | 币种名称 |
| contract_address | VARCHAR(100) | BSC链上的合约地址 |
| chain | VARCHAR(20) | 链名称（默认 BSC） |
| decimals | INTEGER | 小数位数（默认 18） |
| is_active | BOOLEAN | 是否激活 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**预置主流币数据**:
- BTC (Bitcoin): 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c
- ETH (Ethereum): 0x2170Ed0880ac9A755fd29B2688956BD959F933F8
- SOL (Solana): 0x570A5D26f7765Ecb712C0924E4De545B89fD43dF
- BNB (Binance Coin): 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
- USDT (Tether USD): 0x55d398326f99059fF775485246999027B3197955
- USDC (USD Coin): 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d

### meme_events 表扩展

增加以下字段支持主流币事件:

| 字段 | 类型 | 说明 |
|------|------|------|
| big_coin_id | INTEGER | 关联 big_coins 表的外键 |
| type | VARCHAR(20) | 扩展支持 'Mainstream' 类型 |

## API 端点

所有主流币 API 端点前缀为 `/api/mainstream`

### 1. 获取主流币列表

**GET** `/api/mainstream/coins`

获取所有支持的主流币种列表。

**查询参数**:
- `is_active` (boolean, 可选): 筛选激活状态
- `chain` (string, 可选): 筛选链名称
- `limit` (number, 可选, 默认100): 返回数量限制
- `offset` (number, 可选, 默认0): 分页偏移量

**响应示例**:
```json
[
  {
    "id": 1,
    "symbol": "BTC",
    "name": "Bitcoin",
    "contract_address": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "chain": "BSC",
    "decimals": 18,
    "is_active": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### 2. 创建主流币事件合约

**POST** `/api/mainstream/events`

创建新的主流币价格预测合约。

**需要认证**: ✅ (Bearer Token)

**请求体**:
```json
{
  "type": "Mainstream",
  "contract_address": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  "creator_side": "yes",
  "initial_pool_amount": 100,
  "duration": "10minutes"
}
```

**参数说明**:
- `type`: 固定为 "Mainstream"
- `contract_address`: 主流币合约地址（必须在 big_coins 表中存在）
- `creator_side`: 创建者投注方向 ("yes" 或 "no")
- `initial_pool_amount`: 初始投注金额
- `duration`: 合约持续时间
  - 支持格式: "10minutes", "30minutes", "5hours", "1days"
  - 简写格式: "72h", "45m", "2d"

**响应示例** (201 Created):
```json
{
  "id": 1,
  "creator_id": 123,
  "type": "Mainstream",
  "contract_address": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  "big_coin_id": 1,
  "big_coin": {
    "symbol": "BTC",
    "name": "Bitcoin",
    "chain": "BSC"
  },
  "creator_side": "yes",
  "initial_pool_amount": "100",
  "yes_pool": "100",
  "no_pool": "0",
  "yes_odds": "50.00",
  "no_odds": "50.00",
  "total_yes_bets": 0,
  "total_no_bets": 0,
  "status": "pending_match",
  "deadline": "2024-01-01T00:10:00.000Z",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

### 3. 获取主流币事件列表

**GET** `/api/mainstream/events`

获取所有主流币事件列表。

**查询参数**:
- `limit` (number, 可选, 默认20): 返回数量
- `offset` (number, 可选, 默认0): 分页偏移

**响应示例**:
```json
[
  {
    "id": 1,
    "creator_id": 123,
    "type": "Mainstream",
    "contract_address": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "big_coin_id": 1,
    "big_coin": {
      "symbol": "BTC",
      "name": "Bitcoin",
      "chain": "BSC"
    },
    "creator_side": "yes",
    "initial_pool_amount": "100",
    "yes_pool": "150",
    "no_pool": "100",
    "yes_odds": "40.00",
    "no_odds": "60.00",
    "total_yes_bets": 2,
    "total_no_bets": 1,
    "status": "active",
    "deadline": "2024-01-01T00:10:00.000Z",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### 4. 获取单个主流币事件详情

**GET** `/api/mainstream/events/:id`

获取指定ID的主流币事件详细信息。

**路径参数**:
- `id` (number): 事件ID

**响应**: 同创建事件响应格式

### 5. 对主流币事件下注

**POST** `/api/mainstream/bets`

对主流币事件进行投注。

**需要认证**: ✅ (Bearer Token)

**请求体**:
```json
{
  "event_id": 1,
  "bet_type": "yes",
  "bet_amount": 50
}
```

**参数说明**:
- `event_id`: 主流币事件ID
- `bet_type`: 投注方向 ("yes" 或 "no")
- `bet_amount`: 投注金额

**响应示例** (201 Created):
```json
{
  "id": 1,
  "event_id": 1,
  "user_id": 456,
  "bet_type": "yes",
  "bet_amount": "50",
  "odds_at_bet": "45.50",
  "potential_payout": null,
  "status": "pending",
  "created_at": "2024-01-01T00:05:00.000Z"
}
```

## 业务逻辑说明

### 事件状态流转

主流币事件与 Meme 事件共享相同的状态机制:

1. **pending_match**: 等待匹配状态
   - 创建者投入初始资金
   - 只允许与创建者相反方向的投注
   - 首笔反向投注后转为 active

2. **active**: 活跃状态
   - 允许任意方向投注
   - 赔率动态变化
   - 到达 deadline 后可结算

3. **settled**: 已结算
   - 管理员完成结算
   - 计算并分配奖金

### 赔率计算

赔率根据资金池比例实时计算:
- YES赔率 = (NO资金池 / 总资金池) × 100
- NO赔率 = (YES资金池 / 总资金池) × 100

### 主流币验证

创建事件时会验证:
1. contract_address 必须存在于 big_coins 表
2. 对应币种必须处于激活状态 (is_active = true)

## WebSocket 实时赔率推送

主流币事件支持通过 WebSocket 接收实时赔率更新。

**连接地址**: `ws://your-host/ws/kline/events/:eventId`

**消息格式**:
```json
{
  "type": "odds_update",
  "data": {
    "yes_odds": "45.50",
    "no_odds": "54.50",
    "timestamp": 1704067200000
  }
}
```

## 数据迁移

运行以下迁移来添加主流币功能:

```bash
npm run migrate
```

这将执行:
1. `002-add-big-coins.ts` - 创建 big_coins 表并插入预置币种
2. `003-add-mainstream-type.ts` - 扩展 meme_events 表支持 Mainstream 类型

## 错误处理

所有 API 端点可能返回的错误:

**400 Bad Request**:
```json
{
  "error": "无效的主流币合约地址或该币种未激活"
}
```

**401 Unauthorized**:
```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "未提供认证令牌"
}
```

**404 Not Found**:
```json
{
  "error": "主流币事件不存在"
}
```

## 使用示例

### 创建 BTC 预测合约

```bash
curl -X POST http://localhost:3000/api/mainstream/events \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Mainstream",
    "contract_address": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "creator_side": "yes",
    "initial_pool_amount": 100,
    "duration": "30minutes"
  }'
```

### 投注 ETH 合约

```bash
curl -X POST http://localhost:3000/api/mainstream/bets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": 1,
    "bet_type": "no",
    "bet_amount": 50
  }'
```

## 注意事项

1. 所有主流币合约地址基于 BSC (Binance Smart Chain)
2. 投注金额会从用户余额中扣除
3. 赔率在每次投注后实时更新
4. WebSocket 连接会在投注后自动推送赔率更新
5. 事件结算需要管理员权限
