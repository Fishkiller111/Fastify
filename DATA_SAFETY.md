# 数据安全说明 - Migration 010

## 📋 概述

此文档说明 Migration 010 (010-add-matching-slide.ts) 对现有数据的影响。

**结论**: ✅ **完全安全** - 不会影响任何现有数据

---

## 🔒 数据安全保证

### ✅ 保证事项

1. **不插入任何初始数据**
   - 没有 INSERT 语句
   - 不会添加新记录到任何表
   - 你的 big_coins 数据完全安全
   - 你的 commission_tiers 数据完全安全

2. **不修改现有数据**
   - 没有 UPDATE 语句
   - 没有 DELETE 语句
   - 不会改变任何现有记录
   - 不会影响任何表的数据内容

3. **完全幂等**
   - 可以安全地重复运行
   - 使用 `IF NOT EXISTS` 和 `CREATE INDEX IF NOT EXISTS`
   - 重复运行不会出错或覆盖任何内容
   - 每个操作都有存在性检查

4. **只读操作**
   - 迁移只添加新字段和索引
   - 不修改现有的表结构（除了添加字段）
   - 不删除任何现有的列或约束
   - 不改变任何现有索引

---

## 📊 迁移执行的操作

### 操作列表

```
迁移 010 执行的操作:
│
├─ ✅ 操作1: 添加 matching_slide 字段到 meme_events
│  ├─ 类型: ALTER TABLE ADD COLUMN
│  ├─ 字段名: matching_slide
│  ├─ 字段类型: INTEGER
│  ├─ 默认值: 50
│  ├─ 约束: CHECK (matching_slide >= 1 AND matching_slide <= 100)
│  └─ 安全: 仅当字段不存在时添加
│
├─ ✅ 操作2: 添加 matched_amount 字段到 meme_events
│  ├─ 类型: ALTER TABLE ADD COLUMN
│  ├─ 字段名: matched_amount
│  ├─ 字段类型: NUMERIC(36, 18)
│  ├─ 默认值: 0
│  └─ 安全: 仅当字段不存在时添加
│
└─ ✅ 操作3: 创建索引
   ├─ 索引名: idx_meme_events_matching_slide
   ├─ 表: meme_events
   ├─ 列: matching_slide
   └─ 安全: 使用 CREATE INDEX IF NOT EXISTS
```

---

## 🛡️ 安全机制

### 1. 幂等性设计

所有操作都使用幂等性设计，确保安全性：

```sql
-- 添加字段前检查
SELECT column_name FROM information_schema.columns
WHERE table_name = 'meme_events' AND column_name = 'matching_slide'

-- 如果存在就跳过，不存在才添加
ALTER TABLE meme_events ADD COLUMN matching_slide INTEGER ...

-- 创建索引时使用 IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_meme_events_matching_slide ...
```

### 2. 事务保护

所有操作在数据库事务中执行：

```
BEGIN TRANSACTION
  执行所有操作
COMMIT (成功)
或
ROLLBACK (失败时)
```

如果任何步骤失败，整个迁移会回滚，不会留下半成品。

### 3. 错误处理

```javascript
try {
  await client.query('BEGIN');
  // 执行所有操作...
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');  // 失败时回滚
  throw error;
}
```

---

## 📝 受影响的表

### 直接受影响

**meme_events 表**
- ✅ 添加 2 个新字段
- ✅ 不删除任何现有字段
- ✅ 不修改任何现有字段
- ✅ 不删除任何现有数据
- ✅ 所有现有记录保持不变

### 不受影响的表

```
❌ big_coins           - 完全不受影响
❌ commission_tiers    - 完全不受影响
❌ meme_bets           - 完全不受影响
❌ users               - 完全不受影响
❌ config              - 完全不受影响
❌ referral_codes      - 完全不受影响
❌ referral_relationships - 完全不受影响
❌ commission_records  - 完全不受影响
```

---

## ✅ 验证步骤

### 迁移前验证

```bash
# 1. 备份数据库（推荐）
pg_dump your_database > backup.sql

# 2. 检查 big_coins 数据
psql your_database -c "SELECT COUNT(*) as count FROM big_coins;"
# 应该显示你的币种数量（例：6）

# 3. 检查 commission_tiers 数据
psql your_database -c "SELECT COUNT(*) as count FROM commission_tiers;"
# 应该显示你的等级数量（例：4）
```

### 迁移执行

```bash
npm run migrate
```

### 迁移后验证

```bash
# 1. 检查新字段是否存在
psql your_database -c "\d meme_events"
# 应该看到新字段：
#  matching_slide | integer
#  matched_amount | numeric

# 2. 验证 big_coins 数据没变
psql your_database -c "SELECT COUNT(*) as count FROM big_coins;"
# 应该还是你之前的数量（例：6）

# 3. 验证 commission_tiers 数据没变
psql your_database -c "SELECT COUNT(*) as count FROM commission_tiers;"
# 应该还是你之前的数量（例：4）

# 4. 检查索引是否创建
psql your_database -c "\d meme_events"
# 应该看到新索引：
#  idx_meme_events_matching_slide
```

---

## 🚀 安全的执行步骤

### 推荐流程

```
1. 备份数据库
   pg_dump your_database > backup.sql

2. 记录迁移前数据
   psql your_database -c "SELECT COUNT(*) FROM big_coins;"
   psql your_database -c "SELECT COUNT(*) FROM commission_tiers;"

3. 执行迁移
   npm run migrate

4. 验证迁移成功
   psql your_database -c "\d meme_events"

5. 验证数据没变
   psql your_database -c "SELECT COUNT(*) FROM big_coins;"
   psql your_database -c "SELECT COUNT(*) FROM commission_tiers;"

6. 编译并启动应用
   npm run build
   npm run dev
```

---

## 🔄 重复运行的安全性

迁移设计为完全幂等，可以安全地重复运行：

```bash
# 第一次运行
npm run migrate
# ✅ 成功添加字段

# 第二次运行
npm run migrate
# ✅ 检查字段已存在，安全跳过
# ✅ 不会出错
# ✅ 不会重复添加
```

---

## ⚠️ 特殊注意

### 关于其他迁移文件

其他迁移文件中有数据插入操作：

- **001-init-database.ts**: 插入 config 和 admin 用户
  - 使用 `ON CONFLICT (key) DO NOTHING` 保证幂等性
  - 重复运行不会重复插入

- **002-add-big-coins.ts**: 插入默认币种
  - 使用 `ON CONFLICT (symbol) DO NOTHING` 保证幂等性
  - 已有的币种不会被覆盖

- **008-referral-system.ts**: 插入默认反佣等级
  - 使用 `ON CONFLICT DO NOTHING` 保证幂等性
  - 已有的等级配置不会被覆盖

**但我的 010 迁移完全不同** - 根本没有 INSERT 语句。

---

## 📞 如有问题

如果你对数据安全有任何疑虑：

1. **查看源代码**: src/migrations/010-add-matching-slide.ts
2. **验证操作**: 看看 SQL 语句，确认没有 DELETE/UPDATE/INSERT
3. **测试环境**: 可以先在测试数据库上运行
4. **备份恢复**: 有备份就可以随时恢复

---

## ✨ 总结

| 项目 | 状态 | 说明 |
|------|------|------|
| 数据安全 | ✅ 100% 安全 | 不会修改任何现有数据 |
| 幂等性 | ✅ 完全幂等 | 可以安全重复运行 |
| 备份需求 | ✅ 可选 | 为保险起见建议备份 |
| 数据验证 | ✅ 简单 | 运行验证命令即可确认 |
| 执行时间 | ✅ 快速 | 仅添加字段和索引 |
| 风险等级 | ✅ 低风险 | ALTER TABLE 和 CREATE INDEX 操作 |

---

**最终结论**: 你的 big_coins 数据和 commission_tiers 数据完全安全。Migration 010 不会以任何方式影响它们。✅

**生成时间**: 2025-10-28
**版本**: 1.0
**状态**: 验证完毕
