# Mainstream 事件时区问题修复文档

## 问题描述

### 现象
- 用户选择 Duration: **5 minutes**
- 实际 deadline 比预期晚 **~8 小时**

```
数据示例:
launch_time: 2025-10-28 14:20:44.946801  (创建时间)
deadline:    2025-10-28 22:21:05.744     (截止时间)
实际时间差: 8 小时 1 分钟 ❌
期望时间差: 5 分钟 ✓
```

### 根本原因

1. **数据库列定义错误**
   - `deadline` 字段定义为 `TIMESTAMP` 而不是 `TIMESTAMP WITH TIME ZONE`
   - PostgreSQL 的 `TIMESTAMP` 不包含时区信息，容易导致时区转换错误

2. **时区不一致**
   - 客户端时区 (可能 UTC+8)
   - 数据库时区 (可能 UTC 或其他)
   - 服务器时区 (可能不同)
   - 三者不一致导致计算错误

3. **calculateDeadline 函数**
   - 虽然 JavaScript Date 对象内部使用 UTC
   - 但缺少明确的 UTC 标记和注释
   - 导致开发者容易出错

## 修复方案

### 1. 修改数据库列定义

**文件**: `src/migrations/001-init-database.ts`

```typescript
// 修改前
deadline TIMESTAMP NOT NULL,
launch_time TIMESTAMP,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
settled_at TIMESTAMP

// 修改后
deadline TIMESTAMP WITH TIME ZONE NOT NULL,
launch_time TIMESTAMP WITH TIME ZONE,
created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
settled_at TIMESTAMP WITH TIME ZONE
```

### 2. 创建迁移脚本修复现有数据库

**文件**: `src/migrations/013-fix-timezone-columns.ts`

运行此迁移脚本来修复现有数据库中的列类型：

```bash
npm run migrate
```

### 3. 改进 calculateDeadline 函数

**文件**: `src/modules/mainstream/service.ts`

```typescript
/**
 * 计算deadline时间
 * 使用 UTC 时间确保时区一致性
 */
function calculateDeadline(duration: string): Date {
  // 使用 UTC 时间戳计算
  const nowUtc = new Date();  // Date 在 JS 中始终是 UTC
  const durationMs = parseDuration(duration);
  const deadlineUtc = new Date(nowUtc.getTime() + durationMs);
  
  console.log(`⏰ Deadline 计算:
    当前 UTC: ${nowUtc.toISOString()}
    Duration: ${duration}
    截止 UTC: ${deadlineUtc.toISOString()}
  `);
  
  return deadlineUtc;
}
```

## 关键概念

### JavaScript Date 对象

```javascript
const d = new Date();

// 内部存储: UTC 时间戳 (从 1970-01-01 00:00:00 UTC 的毫秒数)
d.getTime();           // ✓ 返回 UTC 毫秒数
d.toISOString();       // ✓ 返回 UTC ISO 字符串

// 本地时间显示 (取决于操作系统时区)
d.toString();          // 显示本地时区
d.getHours();          // 返回本地时间的小时
```

### PostgreSQL TIMESTAMP 类型

```sql
-- TIMESTAMP (无时区) - 不建议用于跨时区应用
TIMESTAMP NOT NULL
-- 存储: 2025-10-28 14:20:44
-- 问题: 不知道是哪个时区的 14:20

-- TIMESTAMP WITH TIME ZONE (推荐)
TIMESTAMP WITH TIME ZONE NOT NULL
-- 存储: 2025-10-28 14:20:44+00:00
-- 总是转换并以 UTC 存储
-- 查询时自动转换为会话时区

-- 设置默认值为 UTC
CREATED_AT TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
```

## 完整的时区处理流程

### 后端 (Node.js)

```typescript
// 1. 计算 deadline (使用 UTC)
function calculateDeadline(duration: string): Date {
  const now = new Date();  // UTC 时间戳
  const ms = parseDuration(duration);
  return new Date(now.getTime() + ms);  // UTC 时间戳
}

// 2. 存储到数据库 (PostgreSQL 自动转换为 UTC)
const deadline = calculateDeadline('5minutes');
await client.query(
  'INSERT INTO meme_events (deadline) VALUES ($1)',
  [deadline]  // Date 对象发送给 PG, 自动转换为 UTC
);

// 3. 从数据库读取 (PostgreSQL 返回 UTC)
const result = await client.query('SELECT deadline FROM meme_events');
// result.deadline 仍是 UTC 时间戳
```

### 前端 (JavaScript/TypeScript)

```typescript
// 1. 接收 API 响应 (UTC ISO 字符串)
const response = await fetch('/api/mainstream/events/1');
const event = await response.json();
// event.deadline: "2025-10-28T14:25:44.000Z" (UTC)

// 2. 转换为本地时间显示
const deadline = new Date(event.deadline);  // UTC 字符串转为 Date 对象
const localStr = deadline.toLocaleString();  // 转为本地时区字符串
console.log(localStr);  // 显示用户所在时区的时间

// 3. 计算剩余时间 (使用 UTC)
const now = new Date();  // UTC
const msRemaining = deadline.getTime() - now.getTime();
const minutesRemaining = msRemaining / (1000 * 60);
```

### 数据库查询

```sql
-- 查看 UTC 时间
SELECT deadline AT TIME ZONE 'UTC' FROM meme_events;

-- 查看特定时区时间
SELECT deadline AT TIME ZONE 'Asia/Shanghai' FROM meme_events;

-- 确保时区一致性
SET TIME ZONE 'UTC';
SELECT now() AT TIME ZONE 'UTC';
```

## 修复步骤

### 1. 更新代码

已自动修改以下文件:
- ✅ `src/migrations/001-init-database.ts` - 更新列定义
- ✅ `src/migrations/013-fix-timezone-columns.ts` - 创建修复迁移
- ✅ `src/modules/mainstream/service.ts` - 改进 calculateDeadline 函数

### 2. 运行迁移

```bash
cd /Volumes/MachineLearning/开发模版/Backen\ /Nodejs/Fastify

# 编译 TypeScript
npm run build

# 运行迁移脚本 (包括新的时区修复)
npm run migrate

# 或者如果已经存在现有数据,单独运行新迁移
npm run migrate  # 自动运行所有未执行的迁移
```

### 3. 验证修复

```bash
# 连接到数据库
psql -U your_user -d your_db

# 检查列类型
\d meme_events

# 应该看到:
#  deadline              | timestamp with time zone |
#  launch_time           | timestamp with time zone |
#  created_at            | timestamp with time zone |
#  settled_at            | timestamp with time zone |

# 检查数据库时区
SHOW TIME ZONE;
# 应该返回: UTC
```

### 4. 测试

创建新的 Mainstream 事件，验证 deadline 是否正确:

```bash
# 创建 5 分钟的事件
POST /api/mainstream/events
{
  "type": "Mainstream",
  "big_coin_id": 3,
  "creator_side": "yes",
  "initial_pool_amount": 10,
  "duration": "5minutes",
  "future_price": 189.97
}

# 验证 deadline 是否是现在 + 5 分钟 (用 UTC 计算)
```

## 常见问题

### Q: 为什么有 TIMESTAMP 和 TIMESTAMP WITH TIME ZONE 两种？

A: 
- `TIMESTAMP`: 存储本地时间，不含时区信息。适合本地应用。
- `TIMESTAMP WITH TIME ZONE`: 存储 UTC 时间，含时区信息。适合跨时区应用。

在国际应用中，应该总是使用 `WITH TIME ZONE`。

### Q: 为什么 JavaScript Date 对象总是 UTC？

A: JavaScript 标准规定 Date 对象内部使用 UTC 时间戳。`new Date()` 创建的对象包含从 1970-01-01 00:00:00 UTC 的毫秒数，与本地时区无关。

### Q: 现有数据会丢失吗？

A: 不会。迁移脚本使用 `USING deadline AT TIME ZONE 'UTC'` 将现有数据正确转换。

### Q: 为什么还要在 calculateDeadline 中添加注释？

A: 因为时区处理是易错点。明确的文档和日志输出可以帮助调试。

## 性能影响

使用 `TIMESTAMP WITH TIME ZONE` 的性能影响极小:
- 存储空间: 相同 (8 字节)
- 查询性能: 无差异
- 优势: 完全避免了时区转换错误

## 相关资源

- [PostgreSQL TIMESTAMP 文档](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [JavaScript Date 对象](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [ISO 8601 时间格式](https://www.iso.org/iso-8601-date-and-time-format.html)

## 后续建议

1. **统一时区使用**: 所有时间计算都使用 UTC
2. **前端显示**: 在前端根据用户时区显示本地时间
3. **日志记录**: 总是以 UTC 记录日志，便于跨时区查看
4. **API 文档**: 明确说明所有时间戳都是 UTC
5. **单元测试**: 添加时区相关的测试用例
