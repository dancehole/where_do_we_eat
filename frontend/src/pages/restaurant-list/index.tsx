import { View, Text, Button, Input } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useStore } from '../../store'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import { useResponsive, tokens } from '../../hooks/useResponsive'

export default function RestaurantList() {
  const router = useRouter()
  // URL 显式带 code（如碰面详情跳来）→ 作为“子页面”展示（带返回/面包屑）
  // 否则是底部“吃饭”分类进入 → tab 模式，自动用最近一次的碰面码
  const explicitCode = router.params.code || ''
  const code = explicitCode || useStore.getState().lastCode || ''
  const isSubPage = !!explicitCode
  const [priceMax, setPriceMax] = useState('')
  const [list, setList] = useState<any[]>([])
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const { mode } = useResponsive()
  const t = tokens(mode)

  const cols = mode === 'mobile' ? 1 : mode === 'tablet' ? 2 : 3

  const load = async () => {
    if (!code) return
    const params: any = {}
    if (priceMax) params.price_max = Number(priceMax)
    const res = await api.restaurants(code, params)
    setList(res)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ai = async () => {
    setAiLoading(true)
    try {
      const res = await api.aiRecommend({
        center_name: '市中心',
        budget: Number(priceMax) || 100,
        prefers: '靠近商圈、交通方便、优先连锁品牌、评分高',
        restaurants: list,
      })
      setAiText(res.text)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <PageContainer
      title='推荐餐厅'
      subtitle={code ? `碰面码 ${code} · 按距离/评分综合排序` : '先去发起一个碰面，再来这里找餐厅'}
      icon='fork'
      tab='eat'
      back={isSubPage}
      crumb={isSubPage && explicitCode ? ['碰面', explicitCode, '吃饭'] : undefined}
    >
      {!code && (
        <Section title='还没有可推荐的餐厅' icon='fork' tone='orange'>
          <View
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Text style={{ color: '#6b6b6b', fontSize: 13, lineHeight: 1.7 }}>
              你可以从下方菜单进入「碰面」发起一个新的碰面，
              <br />
              或在「我的」里选择一个已存在的碰面码继续。
            </Text>
            <Button
              size='mini'
              onClick={() => Taro.navigateTo({ url: '/pages/meetup-create/index' })}
              style={{
                background: '#ff6b35',
                color: '#fff',
                borderRadius: 999,
                padding: '8px 16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Icon name='plus' size={14} color='#fff' /> 发起碰面
            </Button>
          </View>
        </Section>
      )}
      {/* 筛选 + AI */}
      <Section title='筛选条件' icon='search' tone='orange'>
        <View
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Input
            placeholder='人均上限(元)，留空不限'
            value={priceMax}
            onInput={(e) => setPriceMax(e.detail.value)}
            type='number'
            style={{
              flex: '1 1 180px',
              minWidth: 160,
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
            }}
          />
          <Button
            size='mini'
            onClick={load}
            style={{
              background: '#fff',
              color: '#ff6b35',
              border: '1px solid #ff6b35',
              borderRadius: 999,
              padding: '6px 16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name='search' size={14} /> 筛选
          </Button>
          <Button
            size='mini'
            loading={aiLoading}
            onClick={ai}
            style={{
              background: '#ff6b35',
              color: '#fff',
              border: '1px solid #ff6b35',
              borderRadius: 999,
              padding: '6px 16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name='sparkle' size={14} color='#fff' /> AI 推送
          </Button>
        </View>
      </Section>

      {/* 餐厅列表 */}
      {list.length > 0 && (
        <Section title={`共 ${list.length} 家`} icon='fork'>
          <View
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: 12,
            }}
          >
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
                <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name='fork' size={16} color='#ff6b35' />
                  <Text style={{ fontWeight: 700, color: '#2b2b2b', fontSize: 15 }}>
                    {r.name}
                  </Text>
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

      {aiText && (
        <Section title='AI 推荐' icon='sparkle' tone='orange'>
          <Text style={{ display: 'block', whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#2b2b2b' }}>
            {aiText}
          </Text>
        </Section>
      )}
    </PageContainer>
  )
}
