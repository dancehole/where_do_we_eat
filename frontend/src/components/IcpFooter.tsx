import { View, Text } from '@tarojs/components'

// 中国大陆网站备案号固定底栏。
// 仅 H5 端展示（小程序走微信平台备案，不需要）；process.env.TARO_ENV 由构建期替换为字面量，
// 故小程序包内该组件直接返回 null，不会进包。
export default function IcpFooter() {
  if (process.env.TARO_ENV !== 'h5') return null
  return (
    <View
      onClick={() => {
        // 仅 H5 端有 window；点击跳工信部备案查询页
        if (typeof window !== 'undefined') {
          window.open('https://beian.miit.gov.cn/', '_blank')
        }
      }}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: 26,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(18,18,28,0.86)',
        color: '#cfd3dc',
        fontSize: 11,
        letterSpacing: 0.5,
        WebkitTapHighlightColor: 'transparent',
        cursor: 'pointer',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <Text style={{ color: '#cfd3dc' }}>粤ICP备2024302719号</Text>
    </View>
  )
}
