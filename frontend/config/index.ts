import { defineConfig } from '@tarojs/cli'
import dotenv from 'dotenv'
import path from 'path'
import devConfig from './dev'
import prodConfig from './prod'

// 从后端 .env 读取公开的前端 JS Key（不入库明文，构建期注入）
// 注意：本文件位于 frontend/config/，需上溯两级到项目根再进 backend/
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })

// 小程序端没有 window，无法从页面 URL 推断后端地址，必须构建期注入 API_BASE。
// 优先级：API_BASE（显式，如正式包的 https 合法域名）
//       > API_BASE_WEAPP（backend/.env，内网开发机）
//       > http://192.168.31.5:8000（内网部署机兜底）
// 开发者工具需「不校验合法域名」（project.config.json 已设 urlCheck:false）才能请求 http 内网地址。
const isWeapp = process.env.TARO_ENV === 'weapp'
const weappApiBase =
  process.env.API_BASE || process.env.API_BASE_WEAPP || 'http://192.168.31.5:8000'

export default defineConfig(async (merge, { command, mode }) => {
  const baseConfig = {
    projectName: 'where-do-we-go-to-eat',
    date: '2026-9-7',
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2.34, 750: 1, 828: 1.81 / 1 },
    sourceRoot: 'src',
    outputRoot: 'dist',
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
