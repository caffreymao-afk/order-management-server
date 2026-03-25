require('dotenv').config()

const DATABASE_URL = (process.env.DATABASE_URL || '').trim() || undefined
console.log('[DB] DATABASE_URL prefix:', DATABASE_URL ? DATABASE_URL.substring(0, 30) + '...' : 'NOT SET')

// ─── PostgreSQL（线上） ────────────────────────────────────────────────────────
if (DATABASE_URL) {
  const { Pool } = require('pg')

  // Railway 内网地址不需要 SSL，外网地址（Supabase等）需要 SSL
  const isInternalNetwork = DATABASE_URL.includes('.railway.internal') || DATABASE_URL.includes('localhost')
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isInternalNetwork ? false : { rejectUnauthorized: false },
  })

  // 统一成同步风格的 query 接口（通过 async wrapper）
  module.exports = {
    type: 'pg',
    pool,
    // 执行查询，返回 rows 数组
    async query(sql, params = []) {
      const { rows } = await pool.query(sql, params)
      return rows
    },
    // 执行查询，返回第一行
    async queryOne(sql, params = []) {
      const { rows } = await pool.query(sql, params)
      return rows[0] || null
    },
    // 执行 DDL / DML，返回 rowCount
    async exec(sql, params = []) {
      const result = await pool.query(sql, params)
      return result.rowCount
    },
  }
} else {
  // ─── SQLite（本地开发） ──────────────────────────────────────────────────────
  let BetterSqlite
  try { BetterSqlite = require('better-sqlite3') } catch {
    throw new Error('本地开发需要 better-sqlite3，请运行: npm install better-sqlite3\n线上请设置 DATABASE_URL 环境变量使用 PostgreSQL')
  }
  const path = require('path')
  const fs = require('fs')

  const DB_DIR = path.join(__dirname, '../../data')
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

  const sqlite = new BetterSqlite(path.join(DB_DIR, 'orders.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // 包装成与 pg 兼容的 async 接口
  module.exports = {
    type: 'sqlite',
    sqlite,
    async query(sql, params = []) {
      // SQLite 用 ? 占位，pg 用 $1,$2；统一转换
      const sqSql = toPgToSqlite(sql)
      return sqlite.prepare(sqSql).all(params)
    },
    async queryOne(sql, params = []) {
      const sqSql = toPgToSqlite(sql)
      return sqlite.prepare(sqSql).get(params) || null
    },
    async exec(sql, params = []) {
      const sqSql = toPgToSqlite(sql)
      const result = sqlite.prepare(sqSql).run(params)
      return result.changes
    },
    // 供 seed.js 使用的原生 sqlite 对象
    raw: sqlite,
  }
}

// 将 pg 风格 $1 $2 占位符转为 SQLite 的 ?
function toPgToSqlite(sql) {
  return sql.replace(/\$\d+/g, '?')
}
