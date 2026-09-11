// 极简静态服务器（零依赖，仅 Node 内置模块），用于本地预览 Taro H5 产物。
// 用法: node serve.js <port> <dist目录>
// 支持 SPA 回退：未知路径统一返回 index.html（兼容浏览器 history 路由）。
//
// 说明：默认监听 0.0.0.0，因此同一局域网内的其它设备（手机/平板/另一台电脑）
// 可以通过 http://<本机内网IP>:3000 直接访问，用于真机联调。
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const port = parseInt(process.argv[2] || '3000', 10)
const root = path.resolve(process.argv[3] || 'frontend/dist')

// 访问日志目录（与 serve.js 同级 logs/），便于排查时直接贴出
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
  // 证书：以证书 MIME 返回，手机浏览器打开链接即可进入「安装证书」流程
  '.crt': 'application/x-x509-ca-cert',
  '.pem': 'application/x-x509-ca-cert',
}

// 列出所有内网 IPv4，启动时打印，方便直接拿去在其它设备上访问
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

http
  .createServer((req, res) => {
    // 访问日志：每次请求追加到 logs/access.log，便于排查时直接贴出
    try {
      const ip = req.socket.remoteAddress || '-'
      fs.appendFile(
        path.join(__dirname, 'logs', 'access.log'),
        `${new Date().toISOString()} ${req.method} ${req.url} from ${ip}\n`,
        () => {}
      )
    } catch (e) {}
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p === '/') p = '/index.html'
    let f = path.join(root, p)
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      f = path.join(root, 'index.html')
    }
    fs.readFile(f, (e, d) => {
      if (e) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(f)] || 'application/octet-stream',
        // 必须彻底禁用缓存：Taro 产物的 chunk 名是固定数字（chunk/266.js 等），
        // 只有 no-store 才能保证重建后浏览器一定拿到新代码，否则会一直跑旧包（曾因此误判“修复无效”）。
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      })
      res.end(d)
    })
  })
  .listen(port, '0.0.0.0', () => {
    console.log(`static server on http://localhost:${port}  root=${root}`)
    lanAddresses().forEach((i) => {
      console.log(`  LAN  -> http://${i.address}:${port}   (${i.name})`)
    })
  })
