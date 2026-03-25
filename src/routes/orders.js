const express = require('express')
const router = express.Router()
const ordersData = require('../data/orders')

const ok   = (res, data) => res.json({ code: 0, msg: 'success', data })
const fail = (res, msg, code = 400) => res.status(code).json({ code, msg, data: null })

router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, startDate, endDate, orderStatus, shop, productName } = req.query
    const result = await ordersData.getOrders({ page, pageSize, startDate, endDate, orderStatus, shop, productName })
    ok(res, result)
  } catch (err) { fail(res, err.message, 500) }
})

router.get('/meta/shops', async (req, res) => {
  try {
    ok(res, await ordersData.getShops())
  } catch (err) { fail(res, err.message, 500) }
})

router.get('/meta/estimate', async (req, res) => {
  try {
    const { startDate, endDate, orderStatus, shop, productName } = req.query
    const count = await ordersData.estimateExportCount({ startDate, endDate, orderStatus, shop, productName })
    ok(res, { estimatedCount: count, overLimit: count > 100000 })
  } catch (err) { fail(res, err.message, 500) }
})

router.get('/:id', async (req, res) => {
  try {
    const order = await ordersData.getOrderById(req.params.id)
    if (!order) return fail(res, '订单不存在', 404)
    ok(res, order)
  } catch (err) { fail(res, err.message, 500) }
})

module.exports = router
