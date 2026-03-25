// 简单的请求日志中间件
module.exports = (req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m'
    console.log(`${color}[${new Date().toLocaleTimeString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)\x1b[0m`)
  })
  next()
}
