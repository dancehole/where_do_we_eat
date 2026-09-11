import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useStore } from '../../store'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import { useResponsive, tokens } from '../../hooks/useResponsive'

export default function Mine() {
  const { mode } = useResponsive()
  const t = tokens(mode)
  const deviceId = useStore((s) => s.deviceId)
  const meetupCode = useStore((s) => s.meetupCode)
  const lastCode = useStore((s) => s.lastCode)

  const maskedId = deviceId ? `${deviceId.slice(0, 6)}…${deviceId.slice(-4)}` : '-'

  const enterCode = (code: string) => {
    if (!code) return
    Taro.navigateTo({ url: `/pages/meetup-detail/index?code=${code}` })
  }

  return (
    <PageContainer title='我的' subtitle='本地碰面 · 智能推荐' icon='user' tab='mine'>
      {/* 账户卡 */}
      <Section title='本机身份' icon='user' tone='blue'>
        <View style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              background: 'rgba(59,130,246,0.15)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 20,
            }}
          >
            我
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: 700, color: '#2b2b2b', fontSize: 16 }}>本地用户</Text>
            <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 2 }}>
              设备 ID：{maskedId}
            </Text>
          </View>
        </View>
      </Section>

      {/* 最近碰面 */}
      <Section
        title='最近的碰面'
        icon='users'
        tone='orange'
        extra={
          <Button
            size='mini'
            onClick={() => Taro.navigateTo({ url: '/pages/meetup-list/index' })}
            style={{
              background: 'transparent',
              color: '#ff6b35',
              border: '1px solid rgba(255,107,53,0.3)',
              borderRadius: 999,
              padding: '4px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            全部 <Icon name='arrow' size={12} color='#ff6b35' />
          </Button>
        }
      >
        {lastCode ? (
          <View
            onClick={() => enterCode(lastCode)}
            style={{
              padding: 12,
              background: '#fff',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
            }}
          >
            <Icon name='users' size={20} color='#ff6b35' />
            <Text style={{ flex: 1, fontWeight: 600, color: '#2b2b2b' }}>碰面 {lastCode}</Text>
            <Icon name='arrow' size={16} color='#9ca3af' />
          </View>
        ) : (
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>还没有碰面，去发起一个吧</Text>
        )}
      </Section>

      {/* 快捷入口 */}
      <Section title='快捷操作' icon='sparkle'>
        <View style={{ display: 'grid', gap: 10 }}>
          <View
            onClick={() => Taro.navigateTo({ url: '/pages/meetup-create/index' })}
            style={quickRow('#ff6b35')}
          >
            <Icon name='plus' size={18} color='#ff6b35' />
            <Text style={{ flex: 1, color: '#2b2b2b' }}>发起新的碰面</Text>
            <Icon name='arrow' size={16} color='#9ca3af' />
          </View>
          <View
            onClick={() => Taro.navigateTo({ url: '/pages/meetup-list/index' })}
            style={quickRow('#3b82f6')}
          >
            <Icon name='users' size={18} color='#3b82f6' />
            <Text style={{ flex: 1, color: '#2b2b2b' }}>查看我的碰面</Text>
            <Icon name='arrow' size={16} color='#9ca3af' />
          </View>
          <View
            onClick={() => { if (lastCode) enterCode(lastCode) }}
            style={quickRow('#10b981')}
          >
            <Icon name='fork' size={18} color='#10b981' />
            <Text style={{ flex: 1, color: '#2b2b2b' }}>找吃饭的地方</Text>
            <Icon name='arrow' size={16} color='#9ca3af' />
          </View>
          <View
            onClick={() => Taro.navigateTo({ url: '/pages/preferences/index' })}
            style={quickRow('#8b5cf6')}
          >
            <Icon name='chopsticks' size={18} color='#8b5cf6' />
            <Text style={{ flex: 1, color: '#2b2b2b' }}>我的口味偏好</Text>
            <Icon name='arrow' size={16} color='#9ca3af' />
          </View>
        </View>
      </Section>

      {/* 关于 */}
      <Section title='关于' icon='chopsticks'>
        <Text style={{ display: 'block', fontSize: 13, color: '#6b6b6b', lineHeight: 1.8 }}>
          「我们去哪儿吃饭」帮你和朋友们在不同位置凑出一个最佳碰面点，
          并基于位置、预算与偏好智能推荐餐厅。
        </Text>
        {meetupCode && (
          <Text style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
            当前默认碰面码：{meetupCode}
          </Text>
        )}
      </Section>
    </PageContainer>
  )
}

function quickRow(color: string): any {
  return {
    padding: '12px 14px',
    background: '#fff',
    borderRadius: 10,
    border: `1px solid ${color}22`,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
  }
}
