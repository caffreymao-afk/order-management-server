require('dotenv').config()
const express = require('express')
const cors = require('cors')
const logger = require('./middleware/logger')
const ordersRouter  = require('./routes/orders')
const exportsRouter = require('./routes/exports')

const app  = express()
const PORT = process.env.PORT || 3001

// CORS：允许环境变量里配置的来源
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',').map(s => s.trim())

app.use(cors({
  origin: (origin, cb) => {
    // 允许无 origin（如 curl、Postman）或白名单内来源
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(logger)

app.use('/api/orders',  ordersRouter)
app.use('/api/exports', exportsRouter)

app.get('/api/health', (req, res) => {
  res.json({ code: 0, msg: 'ok', data: { status: 'running', time: new Date().toISOString() } })
})

app.use((req, res) => {
  res.status(404).json({ code: 404, msg: `接口不存在: ${req.method} ${req.path}`, data: null })
})

app.use((err, req, res, _next) => {
  console.error('Server Error:', err.message)
  res.status(500).json({ code: 500, msg: '服务器内部错误', data: null })
})

app.listen(PORT, () => {
  const dbType = process.env.DATABASE_URL ? 'PostgreSQL ☁️' : 'SQLite 💾'
  console.log(`
  ╔══════════════════════════════════════╗
  ║   订单管理系统 后端已启动             ║
  ║   http://localhost:${PORT}              ║
  ║   数据库: ${dbType.padEnd(18)}  ║
  ╚══════════════════════════════════════╝
  `)
})

module.exports = app
