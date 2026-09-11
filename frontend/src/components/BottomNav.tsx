import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import Icon, { IconName } from './Icon'
import { useStore } from '../store'
import { useResponsive } from '../hooks/useResponsive'

export type TabKey = 'home' | 'meetup' | 'eat' | 'mine'

// 四个分类（类似小程序的 tabBar），点击即可一键回到对应页面
export const TABS: { key: TabKey; label: string; icon: IconName; path: string }[] = [
  { key: 'home', label: '首页', icon: 'home', path: '/pages/splash/index' },
  { key: 'meetup', label: '碰面', icon: 'users', path: '/pages/meetup-list/index' },
  { key: 'eat', label: '吃饭', icon: 'fork', path: '/pages/restaurant-list/index' },
  { key: 'mine', label: '我的', icon: 'user', path: '/pages/mine/index' },
]

export default function BottomNav({ active }: { active?: TabKey }) {
  const { mode } = useResponsive()
  const isLarge = mode !== 'mobile'
  const navH = isLarge ? 64 : 58

  const go = (key: TabKey, path: string) => {
    if (key === active) return
    // 吃饭分类：优先带上最近一次碰面码，直接进入对应餐厅列表
    let url = path
    if (key === 'eat') {
      const code = useStore.getState().lastCode || useStore.getState().meetupCode
      if (code) url = `${path}?code=${code}`
    }
    // 已在目标页则不再跳转
    const pages = Taro.getCurrentPages()
    const cur = pages[pages.length - 1]?.route
    if (cur && url.replace(/^\//, '') === cur) return
    // 用 redirectTo 平铺导航栈，避免反复进出导致栈无限增长
    Taro.redirectTo({ url })
  }

  return (
    <View
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: navH,
        zIndex: 50,
        display: 'flex',
        background: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 -4px 18px rgba(180,100,40,0.10)',
      }}
    >
      {TABS.map((t) => {
        const on = t.key === active
        return (
          <View
            key={t.key}
            onClick={() => go(t.key, t.path)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon name={t.icon} size={isLarge ? 22 : 20} color={on ? '#ff6b35' : '#9ca3af'} />
            <Text
              style={{
                fontSize: isLarge ? 12 : 11,
                color: on ? '#ff6b35' : '#9ca3af',
                fontWeight: on ? 600 : 400,
              }}
            >
              {t.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
