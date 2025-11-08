# API 响应添加创建人 username (2025-11-08)

## 变更概述

为以下两个接口的响应中添加了事件创建人的 `creator_username` 字段：

1. `GET /api/meme/events` - Meme 事件列表
2. `GET /api/mainstream/events` - 主流币事件列表

## 修改的文件

### 1. 后端 Service 层

#### `src/modules/meme/service.ts`
- 修改 `getEvents` 函数
- SQL 查询添加 `LEFT JOIN users` 获取 `creator_username`
- 修改 WHERE 条件使用表别名 `me`

**修改前：**
```sql
SELECT *,
  CASE
    WHEN status = 'settled' AND settled_at IS NOT NULL THEN settled_at
    ELSE deadline
  END AS deadline_after_settlement
FROM meme_events
WHERE type != 'Mainstream'
ORDER BY created_at DESC
```

**修改后：**
```sql
SELECT me.*,
  u.username as creator_username,
  CASE
    WHEN me.status = 'settled' AND me.settled_at IS NOT NULL THEN me.settled_at
    ELSE me.deadline
  END AS deadline_after_settlement
FROM meme_events me
LEFT JOIN users u ON me.creator_id = u.id
WHERE me.type != 'Mainstream'
ORDER BY me.created_at DESC
```

#### `src/modules/mainstream/service.ts`
- 修改 `getMainstreamEvents` 函数
- SQL 查询添加 `LEFT JOIN users` 获取 `creator_username`
- 返回对象中添加 `creator_username` 字段

**修改前：**
```sql
SELECT
  me.*,
  bc.symbol,
  bc.name as coin_name,
  bc.chain
FROM meme_events me
INNER JOIN big_coins bc ON me.big_coin_id = bc.id
WHERE me.type = 'Mainstream'
```

**修改后：**
```sql
SELECT
  me.*,
  bc.symbol,
  bc.name as coin_name,
  bc.chain,
  u.username as creator_username
FROM meme_events me
INNER JOIN big_coins bc ON me.big_coin_id = bc.id
LEFT JOIN users u ON me.creator_id = u.id
WHERE me.type = 'Mainstream'
```

### 2. 路由层 Schema

#### `src/modules/meme/routes.ts`
更新 `GET /events` 的响应 schema：
```typescript
properties: {
  id: { type: 'number' },
  creator_id: { type: 'number' },
  creator_username: { type: 'string', nullable: true }, // 新增
  type: { type: 'string' },
  // ...
}
```

#### `src/modules/mainstream/routes.ts`
更新 `GET /events` 的响应 schema：
```typescript
properties: {
  id: { type: 'number' },
  creator_id: { type: 'number' },
  creator_username: { type: 'string', nullable: true }, // 新增
  type: { type: 'string' },
  // ...
}
```

### 3. TypeScript 类型定义

#### `src/modules/meme/types.ts`
```typescript
export interface MemeEvent {
  id: number;
  creator_id: number;
  creator_username?: string; // 新增
  type: MemeEventType;
  // ...
}
```

#### `src/modules/mainstream/types.ts`
```typescript
export interface MainstreamEventResponse {
  id: number;
  creator_id: number;
  creator_username?: string; // 新增
  type: MainstreamEventType;
  // ...
}
```

## API 响应示例

### GET /api/meme/events

**响应示例：**
```json
[
  {
    "id": 1,
    "creator_id": 123,
    "creator_username": "alice",
    "type": "pumpfun",
    "contract_address": "0x123...",
    "creator_side": "yes",
    "status": "active",
    // ...
  }
]
```

### GET /api/mainstream/events

**响应示例：**
```json
[
  {
    "id": 10,
    "creator_id": 456,
    "creator_username": "bob",
    "type": "Mainstream",
    "big_coin_id": 1,
    "big_coin": {
      "symbol": "BTC",
      "name": "Bitcoin",
      "chain": "BSC"
    },
    "status": "active",
    // ...
  }
]
```

## 注意事项

1. **nullable 字段**：`creator_username` 是可选字段（nullable），如果用户被删除或不存在，该字段可能为 `null`
2. **使用 LEFT JOIN**：使用 `LEFT JOIN` 确保即使用户不存在，事件记录仍然会返回
3. **向后兼容**：这是一个增量更新，不会破坏现有的 API 使用者
4. **性能影响**：JOIN 操作对性能影响很小，因为是通过索引进行的外键关联

## 影响范围

### 受影响的 API
1. `GET /api/meme/events` - 返回数据增加 `creator_username` 字段
2. `GET /api/mainstream/events` - 返回数据增加 `creator_username` 字段

### 不受影响的 API
- 单个事件详情接口（`GET /api/meme/events/:id` 等）未修改
- 创建事件接口
- 投注接口
- 其他所有接口

## 后续建议

可以考虑为以下接口也添加 `creator_username`：
- `GET /api/meme/events/:id` - 单个 Meme 事件详情
- `GET /api/mainstream/events/:id` - 单个主流币事件详情
- 其他包含 `creator_id` 的接口响应
