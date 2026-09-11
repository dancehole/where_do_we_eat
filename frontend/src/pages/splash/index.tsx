import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import PageContainer from '../../components/PageContainer'
import Icon from '../../components/Icon'
import { useResponsive } from '../../hooks/useResponsive'

export default function Splash() {
  const { mode } = useResponsive()
  const isLarge = mode !== 'mobile'

  return (
    <PageContainer center tab='home'>
      <View
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isLarge ? 'flex-start' : 'center',
          textAlign: isLarge ? 'left' : 'center',
          gap: 12,
        }}
      >
        {/* 品牌徽标 */}
        <View
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 14px',
            background: 'rgba(255, 107, 53, 0.12)',
            color: '#ff6b35',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          <Icon name='chopsticks' size={16} />
          <Text>本地碰面 · 智能推荐</Text>
        </View>

        <Text
          style={{
            fontSize: mode === 'mobile' ? 30 : mode === 'tablet' ? 38 : 46,
            fontWeight: 800,
            color: '#2b2b2b',
            lineHeight: 1.2,
            letterSpacing: '-0.5px',
          }}
        >
          我们去哪儿吃饭
        </Text>

        <Text
          style={{
            fontSize: mode === 'mobile' ? 14 : 16,
            color: '#6b6b6b',
            lineHeight: 1.7,
            maxWidth: 560,
          }}
        >
          尽管我们身处不同位置，也能找到最佳的碰面地点。
          根据大家的位置算出一个会面中心点，再推荐合适的餐厅。
        </Text>

        {/* 功能亮点三栏（桌面/平板才显示，移动端隐藏以保持简洁） */}
        {isLarge && (
          <View
            style={{
              display: 'flex',
              gap: 16,
              marginTop: 20,
              width: '100%',
              maxWidth: 640,
            }}
          >
            {[
              { icon: 'pin' as const, title: '智能定位', desc: 'IP 定位 + 手动选点' },
              { icon: 'target' as const, title: '碰面中心', desc: '自动算中点 · 同/跨城' },
              { icon: 'sparkle' as const, title: 'AI 推荐', desc: '按预算和偏好推送餐厅' },
            ].map((f) => (
              <View
                key={f.title}
                style={{
                  flex: 1,
                  padding: 16,
                  background: 'rgba(255, 255, 255, 0.7)',
                  border: '1px solid rgba(0,0,0,0.04)',
                  borderRadius: 14,
                }}
              >
                <Icon name={f.icon} size={22} color='#ff6b35' />
                <Text style={{ display: 'block', marginTop: 8, fontSize: 15, fontWeight: 700, color: '#2b2b2b' }}>
                  {f.title}
                </Text>
                <Text style={{ display: 'block', marginTop: 4, fontSize: 13, color: '#6b6b6b' }}>
                  {f.desc}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Button
          type='primary'
          style={{
            marginTop: mode === 'mobile' ? 28 : 24,
            borderRadius: 999,
            padding: `${mode === 'mobile' ? 10 : 12}px ${mode === 'mobile' ? 28 : 36}px`,
            fontSize: mode === 'mobile' ? 15 : 16,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            alignSelf: isLarge ? 'flex-start' : 'center',
          }}
          onClick={() => Taro.navigateTo({ url: '/pages/meetup-create/index' })}
        >
          开始碰面 <Icon name='arrow' size={18} color='#fff' />
        </Button>

        <Button
          size='mini'
          style={{
            marginTop: 12,
            background: 'transparent',
            color: '#6b6b6b',
            alignSelf: isLarge ? 'flex-start' : 'center',
          }}
          onClick={() => Taro.navigateTo({ url: '/pages/meetup-list/index' })}
        >
          查看我的碰面 →
        </Button>
      </View>
    </PageContainer>
  )
}
