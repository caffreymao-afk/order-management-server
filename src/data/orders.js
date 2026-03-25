const db = require('../db/database')

// ─── 查询订单列表 ──────────────────────────────────────────────────────────────
async function getOrders({ page = 1, pageSize = 10, startDate, endDate, orderStatus, shop, productName } = {}) {
  const conditions = []
  const params = []

  if (startDate) {
    params.push(startDate)
    conditions.push(db.type === 'pg'
      ? `create_time::date >= $${params.length}::date`
      : `date(create_time) >= $${params.length}`)
  }
  if (endDate) {
    params.push(endDate)
    conditions.push(db.type === 'pg'
      ? `create_time::date <= $${params.length}::date`
      : `date(create_time) <= $${params.length}`)
  }
  if (orderStatus && orderStatus !== '全部状态') {
    params.push(orderStatus)
    conditions.push(`order_status = $${params.length}`)
  }
  if (shop && shop !== '全部门店') {
    params.push(shop)
    conditions.push(`shop_name = $${params.length}`)
  }
  if (productName) {
    params.push(`%${productName}%`)
    conditions.push(`product_name LIKE $${params.length}`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = await db.queryOne(
    `SELECT COUNT(*) as cnt FROM orders ${where}`,
    params
  )
  const total = parseInt(countRow?.cnt ?? 0)

  const offset = (Number(page) - 1) * Number(pageSize)
  const listParams = [...params, Number(pageSize), offset]

  const list = await db.query(
    `SELECT
       id,
       order_no        AS "orderNo",
       create_time     AS "createTime",
       product_name    AS "productName",
       product_count   AS "productCount",
       pay_amount      AS "payAmount",
       discount_amount AS "discountAmount",
       pay_method      AS "payMethod",
       order_status    AS "orderStatus",
       shop_name       AS "shop"
     FROM orders
     ${where}
     ORDER BY create_time DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  )

  return { list, total, page: Number(page), pageSize: Number(pageSize) }
}

// ─── 查询单条订单 ──────────────────────────────────────────────────────────────
async function getOrderById(id) {
  return db.queryOne(
    `SELECT id,
       order_no AS "orderNo", create_time AS "createTime",
       product_name AS "productName", product_count AS "productCount",
       pay_amount AS "payAmount", discount_amount AS "discountAmount",
       pay_method AS "payMethod", order_status AS "orderStatus", shop_name AS "shop"
     FROM orders WHERE id = $1`,
    [id]
  )
}

// ─── 预估导出数量 ──────────────────────────────────────────────────────────────
async function estimateExportCount({ startDate, endDate, orderStatus, shop, productName } = {}) {
  const conditions = []
  const params = []

  if (startDate) {
    params.push(startDate)
    conditions.push(db.type === 'pg'
      ? `create_time::date >= $${params.length}::date`
      : `date(create_time) >= $${params.length}`)
  }
  if (endDate) {
    params.push(endDate)
    conditions.push(db.type === 'pg'
      ? `create_time::date <= $${params.length}::date`
      : `date(create_time) <= $${params.length}`)
  }
  if (orderStatus && orderStatus !== '全部') {
    params.push(orderStatus)
    conditions.push(`order_status = $${params.length}`)
  }
  if (shop && shop !== '全部门店') {
    params.push(shop)
    conditions.push(`shop_name = $${params.length}`)
  }
  if (productName) {
    params.push(`%${productName}%`)
    conditions.push(`product_name LIKE $${params.length}`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const row = await db.queryOne(`SELECT COUNT(*) as cnt FROM orders ${where}`, params)
  return parseInt(row?.cnt ?? 0)
}

// ─── 获取门店列表 ──────────────────────────────────────────────────────────────
async function getShops() {
  const rows = await db.query('SELECT name FROM shops ORDER BY id')
  return ['全部门店', ...rows.map(r => r.name)]
}

module.exports = { getOrders, getOrderById, estimateExportCount, getShops }
