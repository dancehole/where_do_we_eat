import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon, { IconName } from '../../components/Icon'
import { useResponsive, tokens } from '../../hooks/useResponsive'

// 首页：介绍三大模块分别解决什么问题
//   碰面 —— 解决「在哪碰面」（按大家位置算最佳碰面中心）
//   吃饭 —— 解决「吃什么具体餐厅」（按预算/偏好推荐）
//   排期 —— 解决「什么时候有空」（多人勾选空闲，合并成热力图）
export default function Home() {
  const { mode } = useResponsive()
  const t = tokens(mode)
  const cols = mode === 'mobile' ? 1 : 3

  const MODULES: {
    icon: IconName
    title: string
    tag: string
    desc: string
    path: string
    accent: string
    isNew?: boolean
  }[] = [
    {
      icon: 'users',
      title: '碰面',
      tag: '解决「在哪碰面」',
      desc: '把大家的位置算出一个最公平的碰面中心点，并推荐周边可去的地方。',
      path: '/pages/meetup-list/index',
      accent: '#ff6b35',
    },
    {
      icon: 'fork',
      title: '吃饭',
      tag: '解决「吃什么餐厅」',
      desc: '根据碰面中心、预算和口味偏好，直接推荐具体餐厅，还能在地图上看位置。',
      path: '/pages/restaurant-list/index',
      accent: '#059669',
    },
    {
      icon: 'calendar',
      title: '排期',
      tag: '解决「什么时候有空」',
      desc: '多人各自勾选有空的时间段，自动合并成热力图，一眼看出最佳日期。',
      path: '/pages/schedule-list/index',
      accent: '#3b82f6',
      isNew: true,
    },
  ]

  const go = (path: string) => Taro.navigateTo({ url: path })

  return (
    <PageContainer tab='home' maxWidth={mode === 'mobile' ? 0 : 960}>
      {/* 品牌 hero */}
      <Section tone='orange' flush>
        <View
          style={{
            padding: t.gap,
            background: 'linear-gradient(135deg, rgba(255,107,53,0.12), rgba(255,107,53,0.04))',
            borderRadius: t.radius - 2,
          }}
        >
          <View
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 12px',
              background: 'rgba(255,107,53,0.14)',
              color: '#ff6b35',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Icon name='chopsticks' size={15} color='#ff6b35' />
            <Text>本地碰面 · 智能推荐</Text>
          </View>
          <Text
            style={{
              display: 'block',
              marginTop: 10,
              fontSize: mode === 'mobile' ? 26 : 32,
              fontWeight: 800,
              color: '#2b2b2b',
              lineHeight: 1.25,
            }}
          >
            去哪儿吃饭
          </Text>
          <Text style={{ display: 'block', marginTop: 6, fontSize: 14, color: '#6b6b6b', lineHeight: 1.7 }}>
            三个模块，帮你把一次聚会安排妥当：<Text style={{ color: '#ff6b35', fontWeight: 600 }}>在哪碰</Text>、
            <Text style={{ color: '#059669', fontWeight: 600 }}>吃什么</Text>、
            <Text style={{ color: '#3b82f6', fontWeight: 600 }}>何时聚</Text>。
          </Text>
          <View style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <Button
              size='mini'
              style={{
                background: '#ff6b35',
                color: '#fff',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
              }}
              onClick={() => Taro.navigateTo({ url: '/pages/meetup-create/index' })}
            >
              <Icon name='users' size={14} color='#fff' /> 发起碰面
            </Button>
            <Button
              size='mini'
              style={{
                background: 'rgba(255,255,255,0.8)',
                color: '#3b82f6',
                border: '1px solid rgba(59,130,246,0.35)',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
              }}
              onClick={() => Taro.navigateTo({ url: '/pages/schedule-create/index' })}
            >
              <Icon name='calendar' size={14} color='#3b82f6' /> 新建排期
            </Button>
          </View>
        </View>
      </Section>

      {/* 三大模块 */}
      <Section title='三大模块' icon='sparkle' tone='orange'>
        <Text style={{ display: 'block', fontSize: 13, color: '#6b6b6b', marginBottom: 12 }}>
          点任意一张卡片，直接进入对应模块。
        </Text>
        <View
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: 14,
          }}
        >
          {MODULES.map((m) => (
            <View
              key={m.title}
              onClick={() => go(m.path)}
              style={{
                position: 'relative',
                padding: 18,
                background: '#fff',
                borderRadius: t.radius - 2,
                border: '1px solid rgba(0,0,0,0.05)',
                boxShadow: '0 2px 8px rgba(180,100,40,0.05)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                WebkitTapHighlightColor: 'transparent',
                transition: 'transform .15s ease, box-shadow .15s ease',
              }}
            >
              {m.isNew && (
                <View
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    background: m.accent,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  NEW
                </View>
              )}
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 13,
                  background: `${m.accent}1f`,
                  color: m.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={m.icon} size={24} color={m.accent} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: 800, color: '#2b2b2b' }}>{m.title}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: 600, color: m.accent }}>{m.tag}</Text>
              <Text style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.6 }}>{m.desc}</Text>
              <View
                style={{
                  marginTop: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  color: m.accent,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Text>去使用</Text>
                <Icon name='arrow' size={15} color={m.accent} />
              </View>
            </View>
          ))}
        </View>
      </Section>

      {/* 使用小贴士 */}
      <Section title='怎么用' icon='target' tone='blue'>
        <View style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { icon: 'pin' as IconName, text: '先发起一个碰面，拉上朋友；系统算出碰面中心后推荐餐厅。' },
            { icon: 'calendar' as IconName, text: '若还要约时间，新建一个排期，把链接发给大家各自勾选空闲。' },
            { icon: 'share' as IconName, text: '每个碰面 / 排期都能一键分享，好友点开即可加入，无需登录。' },
          ].map((s, i) => (
            <View key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: 'rgba(59,130,246,0.12)',
                  color: '#3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={s.icon} size={16} color='#3b82f6' />
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>{s.text}</Text>
            </View>
          ))}
        </View>
      </Section>
    </PageContainer>
  )
}
