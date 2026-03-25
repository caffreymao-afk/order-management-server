/**
 * 数据库初始化：建表 + 种子数据（幂等，重复执行安全）
 * 被 app.js 在启动时调用
 */
const { v4: uuidv4 } = require('uuid')
const db = require('./database')

const SHOPS = ['朝阳门店', '三里屯门店', '西城门店', '海淀门店', '丰台门店']
const PRODUCTS = [
  { name: '鲜榨橙汁',     price: 14 }, { name: '拿铁咖啡',     price: 32 },
  { name: '草莓奶昔',     price: 25 }, { name: '美式咖啡',     price: 22 },
  { name: '抹茶千层',     price: 58 }, { name: '焦糖玛奇朵',   price: 36 },
  { name: '芒果冰沙',     price: 28 }, { name: '提拉米苏',     price: 42 },
  { name: '蓝莓松饼',     price: 18 }, { name: '冰美式',       price: 26 },
  { name: '燕麦拿铁',     price: 34 }, { name: '椰香冷萃',     price: 30 },
  { name: '西瓜汁',       price: 16 }, { name: '抹茶拿铁',     price: 32 },
  { name: '巧克力蛋糕',   price: 48 }, { name: '肉桂卷',       price: 22 },
  { name: '百香果气泡水', price: 18 }, { name: '爱尔兰咖啡',   price: 45 },
  { name: '树莓慕斯',     price: 52 }, { name: '柠檬红茶',     price: 15 },
]
const PAY_METHODS = ['微信支付', '支付宝', '美团支付', '现金', '银行卡']
const STATUS_WEIGHTS = [
  { status: '已完成',    weight: 40 }, { status: '已支付',    weight: 20 },
  { status: '处理中',    weight: 10 }, { status: '待支付',    weight: 12 },
  { status: '已取消',    weight: 10 }, { status: '退款/售后', weight:  8 },
]

const rand  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
const pick  = arr => arr[rand(0, arr.length - 1)]
const pickW = items => {
  let r = Math.random() * items.reduce((s, i) => s + i.weight, 0)
  for (const i of items) { r -= i.weight; if (r <= 0) return i.status }
  return items.at(-1).status
}
const fmt = d => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const fmtD = d => fmt(d).slice(0, 10)

module.exports = async function init() {
  const isPg = db.type === 'pg'

  // ── 建表（幂等）────────────────────────────────────────────────────────────
  await db.exec(`CREATE TABLE IF NOT EXISTS shops (
    id   ${isPg ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPg ? '' : 'AUTOINCREMENT'},
    name TEXT NOT NULL UNIQUE
  )`)

  await db.exec(`CREATE TABLE IF NOT EXISTS orders (
    id              TEXT PRIMARY KEY,
    order_no        TEXT NOT NULL UNIQUE,
    create_time     TEXT NOT NULL,
    product_name    TEXT NOT NULL,
    product_count   INTEGER NOT NULL DEFAULT 1,
    pay_amount      REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    pay_method      TEXT NOT NULL DEFAULT '',
    order_status    TEXT NOT NULL,
    shop_name       TEXT NOT NULL
  )`)

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_create_time  ON orders(create_time)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_shop_name    ON orders(shop_name)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_product_name ON orders(product_name)`)

  await db.exec(`CREATE TABLE IF NOT EXISTS export_tasks (
    id            TEXT PRIMARY KEY,
    date_range    TEXT NOT NULL,
    export_count  INTEGER,
    format        TEXT NOT NULL DEFAULT 'XLS',
    filter_shop   TEXT NOT NULL DEFAULT '全部门店',
    filter_status TEXT NOT NULL DEFAULT '全部',
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TEXT NOT NULL,
    expire_date   TEXT,
    operator      TEXT NOT NULL DEFAULT '管理员',
    error_msg     TEXT
  )`)

  // ── 检查是否已有数据（幂等）──────────────────────────────────────────────────
  const row = await db.queryOne('SELECT COUNT(*) as cnt FROM orders')
  const existingCount = parseInt(row?.cnt ?? 0)
  if (existingCount > 0) {
    console.log(`✅ 数据库已有 ${existingCount} 条订单，跳过初始化`)
    return
  }

  console.log('🌱 首次启动，初始化种子数据...')

  // ── 插入门店 ───────────────────────────────────────────────────────────────
  for (const name of SHOPS) {
    await db.exec(
      isPg ? `INSERT INTO shops(name) VALUES($1) ON CONFLICT DO NOTHING`
           : `INSERT OR IGNORE INTO shops(name) VALUES($1)`,
      [name]
    )
  }

  // ── 生成订单（最近60天，约700条）─────────────────────────────────────────────
  const BASE = new Date('2026-03-23T23:59:59')
  let seq = 1

  for (let daysAgo = 0; daysAgo <= 59; daysAgo++) {
    const day = new Date(BASE)
    day.setDate(day.getDate() - daysAgo)
    const isWeekend = [0, 6].includes(day.getDay())
    const count = isWeekend ? rand(12, 22) : rand(6, 14)

    for (let i = 0; i < count; i++) {
      const product  = pick(PRODUCTS)
      const qty      = rand(1, 3)
      const status   = pickW(STATUS_WEIGHTS)
      const discount = rand(0, 1) ? rand(1, Math.min(10, Math.floor(product.price * 0.3))) : 0
      const amount   = status === '退款/售后' ? -(product.price * qty - discount) : product.price * qty - discount

      const t = new Date(day)
      t.setHours(rand(8, 21), rand(0, 59), rand(0, 59), 0)

      const orderNo = `MT${fmtD(day).replace(/-/g, '')}${String(seq++).padStart(4, '0')}`

      await db.exec(
        `INSERT INTO orders(id,order_no,create_time,product_name,product_count,
           pay_amount,discount_amount,pay_method,order_status,shop_name)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [uuidv4(), orderNo, fmt(t), product.name, qty, amount, discount,
         status === '待支付' ? '' : pick(PAY_METHODS), status, pick(SHOPS)]
      )
    }
  }

  // ── 导出任务种子数据 ───────────────────────────────────────────────────────
  const EXPORT_SEEDS = [
    { id: uuidv4(), dateRange: '2026-03-23 ~ 2026-03-23', exportCount: 91,  format: 'XLS', filterShop: '全部门店',   filterStatus: '全部',  status: 'completed', createdAt: '2026-03-23 15:02:18', expireDate: '2026-03-30', operator: '张三（管理员）', errorMsg: null },
    { id: uuidv4(), dateRange: '2026-03-16 ~ 2026-03-23', exportCount: null, format: 'XLS', filterShop: '朝阳门店',  filterStatus: '全部',  status: 'generating', createdAt: '2026-03-23 14:58:02', expireDate: null,          operator: '李四（员工）',  errorMsg: null },
    { id: uuidv4(), dateRange: '2026-03-01 ~ 2026-03-23', exportCount: 312,  format: 'CSV', filterShop: '全部门店',   filterStatus: '已完成', status: 'completed', createdAt: '2026-03-23 10:22:33', expireDate: '2026-03-30', operator: '张三（管理员）', errorMsg: null },
    { id: uuidv4(), dateRange: '2026-02-01 ~ 2026-02-29', exportCount: 421,  format: 'XLS', filterShop: '全部门店',   filterStatus: '全部',  status: 'expired',   createdAt: '2026-03-01 09:10:00', expireDate: null,          operator: '张三（管理员）', errorMsg: null },
    { id: uuidv4(), dateRange: '2026-03-20 ~ 2026-03-22', exportCount: null, format: 'XLS', filterShop: '三里屯门店', filterStatus: '全部',  status: 'failed',    createdAt: '2026-03-22 20:01:44', expireDate: null,          operator: '李四（员工）',  errorMsg: '导出超时，服务器繁忙，请重试' },
  ]
  for (const t of EXPORT_SEEDS) {
    await db.exec(
      `INSERT INTO export_tasks(id,date_range,export_count,format,filter_shop,
         filter_status,status,created_at,expire_date,operator,error_msg)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [t.id, t.dateRange, t.exportCount, t.format, t.filterShop,
       t.filterStatus, t.status, t.createdAt, t.expireDate, t.operator, t.errorMsg]
    )
  }

  const total = await db.queryOne('SELECT COUNT(*) as cnt FROM orders')
  console.log(`✅ 数据库初始化完成，共 ${parseInt(total.cnt)} 条订单`)
}
