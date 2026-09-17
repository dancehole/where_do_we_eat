import { defineConfig } from '@tarojs/cli'
import dotenv from 'dotenv'
import path from 'path'
import devConfig from './dev'
import prodConfig from './prod'

// 从后端 .env 读取公开的前端 JS Key（不入库明文，构建期注入）
// 注意：本文件位于 frontend/config/，需上溯两级到项目根再进 backend/
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })

// 后端目标环境（测试 / 生产）切换。
// 通过构建期环境变量 API_TARGET 选择后端地址：
//   test → 内网开发机 192.168.31.5（HTTP，开发者工具需关闭 urlCheck）
//   prod → 公网 dancehole.cn（HTTPS，已备案 + 小程序 request 合法域名）
// 也可用 API_BASE / API_BASE_WEAPP 显式覆盖（最高优先级，覆盖上面的预设）。
// 缺省：weapp 走内网 192.168.31.5:8000（开发/测试开箱即用）；
//       H5 保持运行时自动推断（与部署位置一致：内网 host:8000 / 公网同源）。
const API_PRESETS: Record<string, string> = {
  test: 'http://192.168.31.5:8000',
  prod: 'https://dancehole.cn/where_do_we_eat',
}
const targetPreset =
  process.env.API_TARGET && API_PRESETS[process.env.API_TARGET]
    ? API_PRESETS[process.env.API_TARGET]
    : null

const isWeapp = process.env.TARO_ENV === 'weapp'
const weappApiBase =
  process.env.API_BASE ||
  process.env.API_BASE_WEAPP ||
  targetPreset ||
  'http://192.168.31.5:8000'

export default defineConfig(async (merge, { command, mode }) => {
  const baseConfig = {
    projectName: 'where-do-we-go-to-eat',
    date: '2026-9-7',
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2.34, 750: 1, 828: 1.81 / 1 },
    sourceRoot: 'src',
    // 小程序与 H5 产物都默认叫 dist，会互相覆盖。weapp 构建时传 TARO_OUTPUT=dist-weapp
    // 直接输出到 dist-weapp/，避免与 H5 的 dist/ 冲突；root project.config.json 的
    // miniprogramRoot 指向 dist-weapp/。H5 构建保持默认 dist/（部署到服务器）。
    outputRoot: process.env.TARO_OUTPUT || 'dist',
    plugins: [],
    defineConstants: {
      'process.env.AMAP_JS_KEY': JSON.stringify(process.env.AMAP_JS_KEY || ''),
      'process.env.AMAP_SECURITY_CODE': JSON.stringify(process.env.AMAP_SECURITY_CODE || ''),
      // 小程序端注入内网后端地址（H5 保持运行时自动推断，不受影响）
      'process.env.API_BASE': JSON.stringify(
        isWeapp ? weappApiBase : process.env.API_BASE || ''
      ),
    },
    copy: { patterns: [], options: {} },
    framework: 'react',
    compiler: 'webpack5',
    mini: {
      postcss: { pxtransform: { enable: true }, cssmodules: { enable: false } },
    },
    h5: {
      // 生产 Web 部署在子路径（如 dancehole.cn/where_do_we_eat）时，构建期传 PUBLIC_PATH=/where_do_we_eat/
      publicPath: process.env.PUBLIC_PATH || '/',
      staticDirectory: 'static',
      postcss: { autoprefixer: { enable: true }, cssmodules: { enable: false } },
    },
  }
  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
