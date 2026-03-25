const express = require('express')
const router = express.Router()
const exportsData = require('../data/exports')
const ordersData  = require('../data/orders')

const ok   = (res, data) => res.json({ code: 0, msg: 'success', data })
const fail = (res, msg, code = 400) => res.status(code).json({ code, msg, data: null })

// 获取导出记录列表
router.get('/', async (req, res) => {
  try {
    const tasks = await exportsData.getExportTasks()
    ok(res, { list: tasks, total: tasks.length })
  } catch (err) { fail(res, err.message, 500) }
})

// 创建导出任务
router.post('/', async (req, res) => {
  try {
    const { startDate, endDate, orderStatus, shop, productName, format = 'xlsx' } = req.body
    if (!startDate || !endDate) return fail(res, '时间范围为必填项')

    const estimatedCount = await ordersData.estimateExportCount({ startDate, endDate, orderStatus, shop, productName })
    if (estimatedCount > 100000) return fail(res, `数据量超出限制：预计 ${estimatedCount.toLocaleString()} 条，上限 10 万条`)

    const isAsync = estimatedCount > 1000
    const task = await exportsData.createExportTask({ startDate, endDate, orderStatus, shop, productName, format, isAsync, estimatedCount })

    ok(res, {
      task,
      isAsync,
      message: isAsync ? '导出任务已提交，完成后将通过站内消息通知您' : '文件已生成，即将开始下载',
    })
  } catch (err) { fail(res, err.message, 500) }
})

// 查询单个任务状态
router.get('/:id', async (req, res) => {
  try {
    const task = await exportsData.getExportTaskById(req.params.id)
    if (!task) return fail(res, '导出任务不存在', 404)
    ok(res, task)
  } catch (err) { fail(res, err.message, 500) }
})

// 下载导出文件
router.get('/:id/download', async (req, res) => {
  try {
    const task = await exportsData.getExportTaskById(req.params.id)
    if (!task)                      return fail(res, '任务不存在', 404)
    if (task.status !== 'completed') return fail(res, '文件尚未生成')
    if (task.status === 'expired')   return fail(res, '文件已过期')

    const result = await ordersData.getOrders({ page: 1, pageSize: 10000 })
    const headers = ['订单编号','下单时间','商品名称','数量','实付金额','优惠金额','支付方式','订单状态','门店']
    const rows = result.list.map(o => [
      o.orderNo, o.createTime, o.productName, o.productCount,
      o.payAmount, o.discountAmount, o.payMethod || '待支付', o.orderStatus, o.shop,
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const filename = `orders_${(task.dateRange || '').replace(/ ~ /g, '_to_')}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.send('\uFEFF' + csv)
  } catch (err) { fail(res, err.message, 500) }
})

// 重新导出
router.post('/:id/retry', async (req, res) => {
  try {
    const original = await exportsData.getExportTaskById(req.params.id)
    if (!original) return fail(res, '原任务不存在', 404)
    const [startDate, endDate] = original.dateRange.split(' ~ ')
    const estimatedCount = await ordersData.estimateExportCount({ startDate, endDate })
    const isAsync = estimatedCount > 1000
    const task = await exportsData.createExportTask({
      startDate, endDate,
      orderStatus: original.filterStatus,
      shop: original.filterShop,
      format: original.format === 'XLS' ? 'xlsx' : 'csv',
      isAsync, estimatedCount,
    })
    ok(res, { task, isAsync })
  } catch (err) { fail(res, err.message, 500) }
})

module.exports = router
