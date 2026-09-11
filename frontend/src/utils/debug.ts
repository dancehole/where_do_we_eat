import { getApiBase } from '../config'

// 极简前端 → 后端调试通道。
// 浏览器里排查不到的运行时错误（尤其是高德脚本加载/地图初始化失败）直接 POST 到后端
// `POST /api/debug/log`，落到服务器日志 `%TEMP%\amap_debug.log`，便于开发时实时定位。
export function reportDebug(msg: unknown, level: 'INFO' | 'ERROR' = 'INFO') {
  if (typeof window === 'undefined') return
  try {
    const text = typeof msg === 'string' ? msg : String((msg as any)?.message || msg)
    const body = JSON.stringify({ level, msg: text })
    void fetch(`${getApiBase()}/api/debug/log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* 调试通道失败不影响主流程 */
    })
  } catch {
    /* ignore */
  }
}
