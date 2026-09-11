import { View, Text, Button, Input, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useStore } from '../../store'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import { useResponsive, tokens } from '../../hooks/useResponsive'

/** 列表页只放最常用的几个菜系，详细的去「我的偏好」里选 */
const CUISINE_QUICK = ['日料', '火锅', '川菜', '粤菜', '西餐', '烧烤', '快餐', '咖啡']

export default function RestaurantList() {
  const router = useRouter()
  // URL 显式带 code（如碰面详情跳来）→ 作为“子页面”展示（带返回/面包屑）
  // 否则是底部“吃饭”分类进入 → tab 模式，自动用最近一次的碰面码
  const explicitCode = router.params.code || ''
  const code = explicitCode || useStore.getState().lastCode || ''
  const isSubPage = !!explicitCode

  // 只暴露 4 个重要筛选
  const [priceMax, setPriceMax] = useState('')
  const [cats, setCats] = useState<string[]>([])
  const [nearSubway, setNearSubway] = useState(false)
  const [bizDistrict, setBizDistrict] = useState(false)
  // 「排序更多餐厅」
  const [more, setMore] = useState(false)

  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiCtx, setAiCtx] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const { mode } = useResponsive()
  const t = tokens(mode)

  const cols = mode === 'mobile' ? 1 : mode === 'tablet' ? 2 : 3

  const load = async () => {
    if (!code) return
    setLoading(true)
    try {
      const params: any = {}
      if (priceMax) params.price_max = Number(priceMax)
      if (cats.length) params.categories = cats.join(',')
      if (nearSubway) params.near_subway = true
      if (bizDistrict) params.business_district = true
      if (more) params.more = true
      const res = await api.restaurants(code, params)
      setList(res || [])
    } catch {
      Taro.showToast({ title: '获取餐厅失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ai = async () => {
    setAiLoading(true)
    try {
      // 只传 code + 当前列表，其余上下文（偏好/预算/商圈）由后端拼装
      const res: any = await api.aiRecommend({ code, restaurants: list })
      setAiText(res?.text || '')
      setAiCtx(res?.context || null)
    } catch {
      Taro.showToast({ title: 'AI 推送失败', icon: 'none' })
    } finally {
      setAiLoading(false)
    }
  }

  const toggleIn = (arr: string[], v: string, setter: (x: string[]) => void) => {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  }

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <View
      key={label}
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        cursor: 'pointer',
        background: on ? '#ff6b35' : '#fff',
        border: `1px solid ${on ? '#ff6b35' : 'rgba(0,0,0,0.08)'}`,
      }}
    >
      <Text style={{ fontSize: 13, color: on ? '#fff' : '#6b7280' }}>{label}</Text>
    </View>
  )

  return (
    <PageContainer
      title='推荐餐厅'
      subtitle={code ? `碰面码 ${code} · 按评分/价格/菜系/交通/距离综合排序` : '先去发起一个碰面，再来这里找餐厅'}
      icon='fork'
      tab='eat'
      back={isSubPage}
      crumb={isSubPage && explicitCode ? ['碰面', explicitCode, '吃饭'] : undefined}
    >
      {!code && (
        <Section title='还没有可推荐的餐厅' icon='fork' tone='orange'>
          <View style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <Text style={{ color: '#6b6b6b', fontSize: 13, lineHeight: 1.7 }}>
              你可以从下方菜单进入「碰面」发起一个新的碰面，
              <br />
              或在「我的」里选择一个已存在的碰面码继续。
            </Text>
            <Button
              size='mini'
              onClick={() => Taro.navigateTo({ url: '/pages/meetup-create/index' })}
              style={{ background: '#ff6b35', color: '#fff', borderRadius: 999, padding: '8px 16px' }}
            >
              <Icon name='plus' size={14} color='#fff' /> 发起碰面
            </Button>
          </View>
        </Section>
      )}

      {code && (
        <Section title='筛选条件' icon='search' tone='orange' extra={
          <View
            onClick={() => Taro.navigateTo({ url: '/pages/preferences/index' })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#ff6b35' }}
          >
            <Icon name='chopsticks' size={14} color='#ff6b35' />
            <Text style={{ fontSize: 13, color: '#ff6b35' }}>我的偏好</Text>
          </View>
        }>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Input
              placeholder='人均上限(元)，留空不限'
              value={priceMax}
              onInput={(e) => setPriceMax(e.detail.value)}
              type='number'
              style={{
                flex: '1 1 160px',
                minWidth: 140,
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
              }}
            />
            {chip(nearSubway ? '✓ 近地铁' : '近地铁', nearSubway, () => setNearSubway((v) => !v))}
            {chip(bizDistrict ? '✓ 近商圈' : '近商圈', bizDistrict, () => setBizDistrict((v) => !v))}
            {chip(more ? '✓ 排序更多餐厅' : '排序更多餐厅', more, () => setMore((v) => !v))}
          </View>

          <Text style={{ display: 'block', marginTop: 10, fontSize: 12, color: '#6b6b6b' }}>菜系（可多选）</Text>
          <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {CUISINE_QUICK.map((c) => chip(c, cats.includes(c), () => toggleIn(cats, c, setCats)))}
          </View>

          <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button
              size='mini'
              loading={loading}
              onClick={load}
              style={{ background: '#fff', color: '#ff6b35', border: '1px solid #ff6b35', borderRadius: 999, padding: '6px 16px' }}
            >
              <Icon name='search' size={14} /> 应用筛选
            </Button>
            <Button
              size='mini'
              loading={aiLoading}
              onClick={ai}
              style={{ background: '#ff6b35', color: '#fff', border: '1px solid #ff6b35', borderRadius: 999, padding: '6px 16px' }}
            >
              <Icon name='sparkle' size={14} color='#fff' /> AI 推送
            </Button>
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>
              勾选「排序更多餐厅」会翻更多页，再取评分最好的前 25 家参与排序
            </Text>
          </View>
        </Section>
      )}

      {list.length > 0 && (
        <Section title={`共 ${list.length} 家`} icon='fork'>
          <View style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
            {list.map((r) => (
              <View
                key={r.id || r.name}
                style={{
                  padding: t.gap,
                  background: '#fff',
                  borderRadius: t.radius - 2,
                  border: '1px solid rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {typeof r.photo === 'string' && r.photo.startsWith('https://') ? (
                  <Image
                    src={r.photo}
                    mode='aspectFill'
                    style={{ width: '100%', height: 120, borderRadius: 8, display: 'block' }}
                  />
                ) : null}

                <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name='fork' size={16} color='#ff6b35' />
                  <Text style={{ fontWeight: 700, color: '#2b2b2b', fontSize: 15 }}>{r.name}</Text>
                </View>

                <View style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.business_area ? (
                    <View style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(59,130,246,0.1)' }}>
                      <Text style={{ fontSize: 11, color: '#3b82f6' }}>商圈 {r.business_area}</Text>
                    </View>
                  ) : null}
                  {r.cuisine ? (
                    <View style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(255,107,53,0.1)' }}>
                      <Text style={{ fontSize: 11, color: '#ff6b35' }}>{r.cuisine}</Text>
                    </View>
                  ) : null}
                  {r.source === 'mock' ? (
                    <View style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(107,114,128,0.12)' }}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>示例数据</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={{ color: '#6b6b6b', fontSize: 12 }}>
                  评分 {r.rating ?? '-'} · 人均 ¥{r.avg_price ?? '-'} · 综合 {r.score}
                </Text>
                <Text style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.6 }}>{r.reason}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}

      {aiText ? (
        <Section title='AI 推荐' icon='sparkle' tone='orange'>
          {aiCtx ? (
            <Text style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 1.6 }}>
              已据此生成：中心地标「{aiCtx.center_name}」
              {aiCtx.budget ? ` · 预算 ¥${aiCtx.budget}` : ''} · 候选 {aiCtx.count} 家
              {'\n'}偏好：{aiCtx.prefers}
            </Text>
          ) : null}
          <Text style={{ display: 'block', whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#2b2b2b' }}>{aiText}</Text>
        </Section>
      ) : null}
    </PageContainer>
  )
}
