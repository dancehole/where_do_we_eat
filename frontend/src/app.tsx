import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { reportDebug } from './utils/debug'
import { weappLogin } from './utils/user'
import './styles/global.css'

// 过滤三方注入脚本的无害报错（只针对这一个高度特征化的错误，不做通用吞错）：
//
//   Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')
//       at et.reportAllChanges (<anonymous>:2:19429)
//       ...
//       at n.timeout (<anonymous>:2:5652)
//
// 该报错来自 Google 的页面性能库 `web-vitals`（CLS 指标），而本项目**并未依赖它**：
//   - package.json / package-lock.json / node_modules 里都不存在 web-vitals；
//   - 最终产物 dist 里搜不到 `AllChanges`；
//   - 高德 JSAPI 1.4.15 与 2.0 的官方脚本里也没有 `reportAllChanges`。
// 它由浏览器扩展或内置预览容器注入，与地图/定位/接口无关，属控制台噪音。
// 这里只静默这一种错误，并且仍然上报后端调试通道，避免“把真问题藏起来”。
function installThirdPartyErrorFilter() {
  if (typeof window === 'undefined') return
  let reported = false
  window.addEventListener('error', (e: any) => {
    const msg = String(e?.message || '')
    const stack = String(e?.error?.stack || e?.error?.message || '')
    if (msg.includes("reading 'startTime'") && stack.includes('reportAllChanges')) {
      if (!reported) {
        reported = true
        reportDebug('[third-party] 已静默 web-vitals reportAllChanges/startTime 报错（非本项目代码，仅控制台噪音）')
      }
      if (typeof e.preventDefault === 'function') e.preventDefault()
    }
  })
}

// 仅 H5 注册（小程序无 window；TARO_ENV 为构建期字面量，该分支不会进小程序包）
if (process.env.TARO_ENV === 'h5') {
  installThirdPartyErrorFilter()
}

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('App launched.')
    // 微信小程序：启动时用 wx.login 换 openid，作为稳定的微信匿名身份（失败不影响使用，回退设备匿名）
    if (process.env.TARO_ENV === 'weapp') {
      weappLogin().catch(() => {})
    }
  })
  return children
}

export default App
