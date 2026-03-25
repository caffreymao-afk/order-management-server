const { v4: uuidv4 } = require('uuid')
const db = require('../db/database')

function now() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function datePlus7() {
  const d = new Date(Date.now() + 7 * 86400 * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

const SELECT_COLS = `
  id,
  date_range    AS "dateRange",
  export_count  AS "exportCount",
  format,
  filter_shop   AS "filterShop",
  filter_status AS "filterStatus",
  status,
  created_at    AS "createdAt",
  expire_date   AS "expireDate",
  operator,
  error_msg     AS "errorMsg"
`

// ─── 查询导出记录列表 ──────────────────────────────────────────────────────────
async function getExportTasks() {
  return db.query(`SELECT ${SELECT_COLS} FROM export_tasks ORDER BY created_at DESC`)
}

// ─── 查询单条导出任务 ──────────────────────────────────────────────────────────
async function getExportTaskById(id) {
  return db.queryOne(`SELECT ${SELECT_COLS} FROM export_tasks WHERE id = $1`, [id])
}

// ─── 创建导出任务 ──────────────────────────────────────────────────────────────
async function createExportTask({ startDate, endDate, orderStatus, shop, format, isAsync, estimatedCount }) {
  const id = uuidv4()

  await db.exec(
    `INSERT INTO export_tasks
       (id, date_range, export_count, format, filter_shop, filter_status,
        status, created_at, expire_date, operator, error_msg)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      `${startDate} ~ ${endDate}`,
      isAsync ? null : estimatedCount,
      format === 'xlsx' ? 'XLS' : 'CSV',
      shop || '全部门店',
      orderStatus || '全部',
      isAsync ? 'generating' : 'completed',
      now(),
      isAsync ? null : datePlus7(),
      '张三（管理员）',
      null,
    ]
  )

  // 异步任务：5秒后模拟完成
  if (isAsync) {
    setTimeout(async () => {
      await db.exec(
        `UPDATE export_tasks
         SET status='completed', export_count=$1, expire_date=$2
         WHERE id=$3`,
        [estimatedCount, datePlus7(), id]
      )
    }, 5000)
  }

  return getExportTaskById(id)
}

// ─── 更新任务状态 ──────────────────────────────────────────────────────────────
async function updateTaskStatus(id, status, extra = {}) {
  const sets = ['status=$1']
  const params = [status]

  if (extra.exportCount !== undefined) { sets.push(`export_count=$${params.push(extra.exportCount)}`)}
  if (extra.expireDate  !== undefined) { sets.push(`expire_date=$${params.push(extra.expireDate)}`)}
  if (extra.errorMsg    !== undefined) { sets.push(`error_msg=$${params.push(extra.errorMsg)}`)}

  params.push(id)
  await db.exec(`UPDATE export_tasks SET ${sets.join(',')} WHERE id=$${params.length}`, params)
  return getExportTaskById(id)
}

module.exports = { getExportTasks, getExportTaskById, createExportTask, updateTaskStatus }
