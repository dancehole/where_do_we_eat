// 内网 HTTPS 同源服务器（零依赖，仅 Node 内置模块）。
//
// 目的：局域网/内网通过 https 访问 → 浏览器进入「安全上下文」→ navigator.geolocation
//       精确定位可用（http://内网IP 会被浏览器判为非安全上下文，定位必失败）。
//
// 同时把 /api/* 反向代理到后端 :8000，保证「页面 https + 接口 https 同源」，避免混合内容拦截。
//
// 用法: node https_server.js [https端口] [dist目录] [证书目录]
//   HTTPS_PORT / DIST_DIR / CERT_DIR / BACKEND_HOST / BACKEND_PORT 环境变量可覆盖
const https = require('https')
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const port = parseInt(process.env.HTTPS_PORT || process.argv[2] || '8443', 10)
const root = path.resolve(process.env.DIST_DIR || process.argv[3] || 'frontend/dist')
const certDir = path.resolve(process.env.CERT_DIR || process.argv[4] || 'certs')
const backendHost = process.env.BACKEND_HOST || '127.0.0.1'
const backendPort = parseInt(process.env.BACKEND_PORT || '8000', 10)

const key = fs.readFileSync(path.join(certDir, 'server.key'))
const cert = fs.readFileSync(path.join(certDir, 'server.crt'))

try {
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true })
} catch (e) {}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
}

function lanAddresses() {
  const out = []
  const ifaces = os.networkInterfaces()
  Object.keys(ifaces).forEach((name) => {
    ;(ifaces[name] || []).forEach((info) => {
      if (info.family === 'IPv4' && !info.internal) out.push({ name, address: info.address })
    })
  })
  return out
}

function logAccess(req) {
  try {
    fs.appendFile(
      path.join(__dirname, 'logs', 'https-access.log'),
      `${new Date().toISOString()} ${req.method} ${req.url} from ${req.socket.remoteAddress}\n`,
      () => {}
    )
  } catch (e) {}
}

// 转发到后端（保留原始 method/body/头；Host 改为后端地址避免部分框架校验失败）
function proxyApi(req, res) {
  const opt = {
    host: backendHost,
    port: backendPort,
    method: req.method,
    path: req.url,
    headers: Object.assign({}, req.headers, { host: `${backendHost}:${backendPort}` }),
  }
  const p = http.request(opt, (pr) => {
    res.writeHead(pr.statusCode || 502, pr.headers)
    pr.pipe(res)
  })
  p.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: 'backend unreachable: ' + e.message }))
  })
  req.pipe(p)
}

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  let f = path.join(root, p)
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html')
  fs.readFile(f, (e, d) => {
    if (e) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(f)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    })
    res.end(d)
  })
}

const API_PREFIXES = ['/api', '/docs', '/redoc', '/openapi.json']

https
  .createServer({ key, cert }, (req, res) => {
    logAccess(req)
    if (API_PREFIXES.some((pre) => req.url === pre || req.url.startsWith(pre + '/') || req.url.startsWith(pre + '?'))) {
      return proxyApi(req, res)
    }
    serveStatic(req, res)
  })
  .listen(port, '0.0.0.0', () => {
    console.log(`https server on https://localhost:${port}  root=${root} cert=${certDir}`)
    lanAddresses().forEach((i) => {
      console.log(`  LAN  -> https://${i.address}:${port}   (${i.name})`)
    })
    console.log('  注意：设备需先安装 certs/ca.crt 为受信任根证书，否则浏览器会拦截。')
  })
