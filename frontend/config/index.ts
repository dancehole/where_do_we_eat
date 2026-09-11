import { defineConfig } from '@tarojs/cli'
import dotenv from 'dotenv'
import path from 'path'
import devConfig from './dev'
import prodConfig from './prod'

// 从后端 .env 读取公开的前端 JS Key（不入库明文，构建期注入）
// 注意：本文件位于 frontend/config/，需上溯两级到项目根再进 backend/
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })

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
      // 可选：显式指定后端地址（留空则 H5 运行时自动取「当前主机名:8000」，便于内网/局域网访问）
      'process.env.API_BASE': JSON.stringify(process.env.API_BASE || ''),
    },
    copy: { patterns: [], options: {} },
    framework: 'react',
    compiler: 'webpack5',
    mini: {
      postcss: { pxtransform: { enable: true }, cssmodules: { enable: false } },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      postcss: { autoprefixer: { enable: true }, cssmodules: { enable: false } },
    },
  }
  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
