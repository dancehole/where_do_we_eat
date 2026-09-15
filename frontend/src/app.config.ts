// 注意：此处不要从 '@tarojs/taro' import defineAppConfig。
// Taro 在 Node 端用 esbuild 直接求值 app.config.ts，引入 @tarojs/taro 会加载
// @tarojs/runtime 的 env.js 访问 window，导致 H5 构建报 "window is not defined"。
// 直接导出纯对象即可（defineAppConfig 仅是类型辅助）。
export default {
  pages: [
    'pages/home/index',
    'pages/schedule-list/index',
    'pages/schedule-create/index',
    'pages/schedule-detail/index',
    'pages/schedule-merge/index',
    'pages/meetup-create/index',
    'pages/meetup-list/index',
    'pages/meetup-detail/index',
    'pages/restaurant-list/index',
    'pages/preferences/index',
    'pages/mine/index',
  ],
  window: {
    navigationBarTitleText: '我们去哪儿吃饭',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f6f6f6',
  },
}
