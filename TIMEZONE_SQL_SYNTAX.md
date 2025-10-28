# PostgreSQL 时区处理：正确的 SQL 语法

## 问题

在修复时区 Bug 时，遇到的 SQL 语法错误：

```sql
-- ❌ 错误
created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC'

-- ✅ 正确
created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
```

## 原因

PostgreSQL 中 `AT TIME ZONE` 子句只能用于以下场景：

### 1. ✅ 类型转换（USING 子句）

```sql
-- ALTER TABLE 时转换现有数据
ALTER TABLE meme_events
ALTER COLUMN deadline TYPE TIMESTAMP WITH TIME ZONE 
USING deadline AT TIME ZONE 'UTC'
```

**说明**: `USING` 子句告诉 PostgreSQL 如何将旧数据转换为新类型

### 2. ✅ SELECT 查询中

```sql
-- 查询时转换时区
SELECT 
  deadline,
  deadline AT TIME ZONE 'UTC' as utc_time,
  deadline AT TIME ZONE 'Asia/Shanghai' as shanghai_time
FROM meme_events
```

### 3. ❌ 默认值定义中不能使用

```sql
-- ❌ 错误：不能在 DEFAULT 中使用 AT TIME ZONE
DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC'

-- ✅ 正确：使用 DEFAULT CURRENT_TIMESTAMP
-- PostgreSQL 会自动以服务器时区存储（通常是 UTC）
DEFAULT CURRENT_TIMESTAMP
```

## 为什么？

1. **时区存储**：`TIMESTAMP WITH TIME ZONE` 类型总是以 UTC 存储，不管输入是什么时区
2. **默认值**：`CURRENT_TIMESTAMP` 已经返回当前时间（UTC），无需再转换
3. **会话时区**：如果需要特定时区，应该在会话或查询级别设置，而不是表定义中

## 最佳实践

### 创建表

```typescript
// ✅ 推荐的列定义
await client.query(`
  CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )
`);
```

### 修改表

```typescript
// ✅ 转换现有数据时，使用 USING 子句
await client.query(`
  ALTER TABLE events
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE 
  USING created_at AT TIME ZONE 'UTC'
`);

// ✅ 更新默认值
await client.query(`
  ALTER TABLE events
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP
`);
```

### 查询数据

```typescript
// ✅ 在查询时转换时区
const result = await client.query(`
  SELECT 
    id,
    created_at,
    created_at AT TIME ZONE 'UTC' as utc_time,
    created_at AT TIME ZONE 'Asia/Shanghai' as local_time
  FROM events
  WHERE created_at > NOW() - INTERVAL '1 day'
`);
```

## 时区配置最佳实践

### 后端配置

```typescript
// Node.js - 所有时间使用 UTC
const now = new Date();  // 总是 UTC
now.toISOString();       // 返回 UTC ISO 字符串

// 存储到数据库时，PostgreSQL 自动转换为 UTC
await client.query(
  'INSERT INTO events (created_at) VALUES ($1)',
  [now]  // 自动转换为 UTC
);
```

### 数据库配置

```sql
-- 设置数据库时区为 UTC (推荐)
ALTER DATABASE your_db SET timezone = 'UTC';

-- 设置会话时区为 UTC
SET TIME ZONE 'UTC';

-- 验证时区设置
SHOW TIME ZONE;
```

### 前端显示

```typescript
// JavaScript - 将 UTC 时间转换为本地显示
const deadline = new Date('2025-10-28T14:25:44.000Z');  // UTC

// 转换为用户本地时间
const localStr = deadline.toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai'  // 或 Intl.DateTimeFormat().resolvedOptions().timeZone
});

console.log(localStr);  // 显示中文日期和时间
```

## 常见错误

### 错误 1: 在 DEFAULT 中使用 AT TIME ZONE

```sql
-- ❌ 错误
DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC'

-- ✅ 正确
DEFAULT CURRENT_TIMESTAMP
```

### 错误 2: 混合使用 TIMESTAMP 和 TIMESTAMP WITH TIME ZONE

```sql
-- ❌ 容易出错：使用无时区的 TIMESTAMP
deadline TIMESTAMP NOT NULL

-- ✅ 推荐：使用带时区的 TIMESTAMP
deadline TIMESTAMP WITH TIME ZONE NOT NULL
```

### 错误 3: 忘记转换现有数据

```sql
-- ❌ 错误：直接修改列类型，可能导致数据解释错误
ALTER TABLE events
ALTER COLUMN deadline TYPE TIMESTAMP WITH TIME ZONE;

-- ✅ 正确：使用 USING 子句确保数据正确转换
ALTER TABLE events
ALTER COLUMN deadline TYPE TIMESTAMP WITH TIME ZONE
USING deadline AT TIME ZONE 'UTC';
```

## 总结表

| 场景 | 语法 | 是否正确 |
|------|------|---------|
| 列定义 | `TIMESTAMP WITH TIME ZONE` | ✅ |
| 默认值 | `DEFAULT CURRENT_TIMESTAMP` | ✅ |
| 默认值 | `DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC'` | ❌ |
| ALTER USING | `USING deadline AT TIME ZONE 'UTC'` | ✅ |
| SELECT | `SELECT deadline AT TIME ZONE 'UTC'` | ✅ |
| 计算 | `DATE_TRUNC('day', deadline AT TIME ZONE 'UTC')` | ✅ |

## 相关文档

- `TIMEZONE_FIX.md` - 时区问题的详细分析
- `TIMEZONE_BUG_FIX_SUMMARY.md` - 修复总结
- PostgreSQL 文档: https://www.postgresql.org/docs/current/datatype-datetime.html
