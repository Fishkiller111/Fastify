# Meme事件合约业务流程说明

## 1. 创建事件合约

创建者创建事件时需要提供:
- `type`: 合约类型 (pumpfun 或 bonk)
- `contract_address`: 目标合约地址
- `creator_side`: 创建者选择的方向 (yes 或 no)
- `initial_pool_amount`: 初始资金池金额
- `deadline`: 结算截止时间 (ISO 8601格式)

**初始状态**: `pending_match` (待匹配)

**示例请求**:
```json
POST /api/meme/events
Authorization: Bearer {token}

{
  "type": "pumpfun",
  "contract_address": "0x123456789abcdef",
  "creator_side": "yes",
  "initial_pool_amount": 1000,
  "deadline": "2025-10-05T00:00:00Z"
}
```

## 2. 匹配机制

### 待匹配区 (pending_match)
- 事件创建后进入待匹配区
- **限制**: 只能下注与创建者相反的方向
  - 如果创建者选择了 `yes`,则只能下注 `no`
  - 如果创建者选择了 `no`,则只能下注 `yes`

### 发射区激活 (active)
- 当对方池子接收到第一笔投注时,事件自动激活
- 状态从 `pending_match` → `active`
- 记录 `launch_time` (开始计时)
- 此后双方都可以继续下注

## 3. 下注流程

**示例请求**:
```json
POST /api/meme/bets
Authorization: Bearer {token}

{
  "event_id": 1,
  "bet_type": "no",
  "bet_amount": 500
}
```

**动态赔率计算**:
- YES赔率 = (NO池子 / 总池子) × 100
- NO赔率 = (YES池子 / 总池子) × 100

**WebSocket实时推送**:
- 每次下注后自动推送最新赔率
- 连接地址: `ws://localhost:3000/ws/kline/events/{eventId}`

## 4. 结算机制

### 触发条件
- 当前时间 >= deadline
- 事件状态为 `active`

### 结算流程
1. 检查目标合约地址在对应平台(pumpfun/bonk)是否成功发射
2. 确定获胜方:
   - `is_launched = true` → YES方获胜
   - `is_launched = false` → NO方获胜
3. 按比例分配资金池:
   - 获胜方按投注额占比分配总池子
   - 失败方投注全部归入池子

**示例请求**:
```json
POST /api/meme/events/{eventId}/settle
Authorization: Bearer {admin_token}

{
  "event_id": 1,
  "is_launched": true
}
```

### 奖金计算公式
```
用户奖金 = (用户投注额 / 获胜方总池子) × 总池子
```

**示例**:
- YES池: 1000, NO池: 800, 总池: 1800
- 结果: YES方获胜
- 用户A投注YES 500:
  - 奖金 = (500 / 1000) × 1800 = 900

## 5. 状态流转图

```
创建事件
   ↓
pending_match (待匹配)
   ↓ (对方下注)
active (发射区,开始计时)
   ↓ (到达deadline)
settled (已结算)
```

## 6. API接口列表

### 事件管理
- `POST /api/meme/events` - 创建事件合约
- `GET /api/meme/events` - 获取事件列表
- `GET /api/meme/events/{id}` - 获取事件详情
- `POST /api/meme/events/{id}/settle` - 结算事件

### 投注管理
- `POST /api/meme/bets` - 用户下注
- `GET /api/meme/bets` - 获取用户投注历史

### K线数据
- `GET /api/kline/events/{eventId}` - 历史K线数据
- `GET /api/kline/events/{eventId}/current` - 当前实时赔率
- `WS /ws/kline/events/{eventId}` - WebSocket实时推送

## 7. 注意事项

1. **资金安全**: 创建事件和下注都会检查用户余额
2. **事务处理**: 所有操作都使用数据库事务确保一致性
3. **实时更新**: 使用WebSocket推送实时赔率变化
4. **deadline检查**: 结算时严格检查是否到达截止时间
5. **单向匹配**: 待匹配状态下只能下注相反方向
