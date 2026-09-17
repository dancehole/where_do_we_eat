import { View, Text, Button, Input, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import { useResponsive, tokens } from '../../hooks/useResponsive'

/** 常见菜系（value 用与后端别名表一致的口语词，便于匹配高德品类） */
const CUISINE_OPTIONS = [
  '日料', '火锅', '川菜', '粤菜', '湘菜', '江浙菜', '东北菜', '西北菜',
  '西餐', '韩餐', '东南亚', '烧烤', '快餐', '面食', '小吃', '素食', '甜品', '咖啡', '海鲜', '自助餐',
]

const RADIUS_OPTIONS = [1000, 2000, 3000, 5000, 10000]

interface Prefs {
  cuisine_include: string[]
  cuisine_exclude: string[]
  brand_include: string[]
  brand_exclude: string[]
  restaurant_include: string[]
  restaurant_exclude: string[]
  area_include: string[]
  price_min: string
  price_max: string
  radius: string
  note: string
}

const EMPTY: Prefs = {
  cuisine_include: [],
  cuisine_exclude: [],
  brand_include: [],
  brand_exclude: [],
  restaurant_include: [],
  restaurant_exclude: [],
  area_include: [],
  price_min: '',
  price_max: '',
  radius: '3000',
  note: '',
}

const API_FIELDS: (keyof Prefs)[] = [
  'cuisine_include', 'cuisine_exclude', 'brand_include', 'brand_exclude',
  'restaurant_include', 'restaurant_exclude', 'area_include',
  'price_min', 'price_max', 'radius', 'note',
]

const inputStyle = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
}

/** 可增删的标签输入（用于品牌/餐厅/商圈这类列表） */
function TagInput({
  values,
  onChange,
  placeholder,
  color = '#ff6b35',
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  color?: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    <View>
      <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Input
          placeholder={placeholder}
          value={draft}
          onInput={(e) => setDraft(e.detail.value)}
          onConfirm={add}
          style={{ ...inputStyle, flex: 1 }}
        />
        <Button
          size='mini'
          onClick={add}
          style={{ background: '#fff', color, border: `1px solid ${color}55`, borderRadius: 999, padding: '8px 14px' }}
        >
          添加
        </Button>
      </View>
      {values.length > 0 && (
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {values.map((v) => (
            <View
              key={v}
              onClick={() => onChange(values.filter((x) => x !== v))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 999,
                background: `${color}14`,
                color,
                border: `1px solid ${color}44`,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Text style={{ fontSize: 12, color }}>{v}</Text>
              <Text style={{ fontSize: 12, color, opacity: 0.7 }}>×</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

/** 多选 chip 列表 */
function Chips({
  options,
  values,
  onChange,
  color = '#ff6b35',
}: {
  options: string[]
  values: string[]
  onChange: (v: string[]) => void
  color?: string
}) {
  return (
    <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = values.includes(o)
        return (
          <View
            key={o}
            onClick={() => onChange(on ? values.filter((x) => x !== o) : [...values, o])}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 13,
              cursor: 'pointer',
              background: on ? color : '#fff',
              color: on ? '#fff' : '#6b7280',
              border: `1px solid ${on ? color : 'rgba(0,0,0,0.08)'}`,
            }}
          >
            <Text style={{ fontSize: 13, color: on ? '#fff' : '#6b7280' }}>{o}</Text>
          </View>
        )
      })}
    </View>
  )
}

export default function Preferences() {
  const { mode } = useResponsive()
  const t = tokens(mode)
  const [p, setP] = useState<Prefs>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setP((s) => ({ ...s, [k]: v }))

  const load = async () => {
    try {
      const res: any = await api.myPreferences()
      const d = res?.prefs || {}
      const next: Prefs = { ...EMPTY }
      API_FIELDS.forEach((f) => {
        const v = d[f]
        if (v === null || v === undefined) return
        if (f === 'price_min' || f === 'price_max' || f === 'radius') {
          next[f] = String(v)
        } else if (f === 'note') {
          next.note = String(v)
        } else if (Array.isArray(v)) {
          ;(next[f] as string[]) = v.map(String)
        }
      })
      setP(next)
    } catch {
      /* 读取失败就用空表单 */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toBody = () => ({
    cuisine_include: p.cuisine_include,
    cuisine_exclude: p.cuisine_exclude,
    brand_include: p.brand_include,
    brand_exclude: p.brand_exclude,
    restaurant_include: p.restaurant_include,
    restaurant_exclude: p.restaurant_exclude,
    area_include: p.area_include,
    price_min: p.price_min ? Number(p.price_min) : null,
    price_max: p.price_max ? Number(p.price_max) : null,
    radius: p.radius ? Number(p.radius) : null,
    note: p.note,
  })

  const save = async () => {
    setSaving(true)
    try {
      await api.savePreferences(toBody())
      Taro.showToast({ title: '已保存', icon: 'success' })
      // 保存成功后返回上一页（偏好为全局设置，返回即可在「我的」继续操作）。
      // pages.length>1 才回退，避免偏好页作为入口页时被误关。
      const pages = Taro.getCurrentPages()
      if (pages.length > 1) {
        // 延迟一点，确保「已保存」提示能被看到再回退
        setTimeout(() => Taro.navigateBack(), 600)
      }
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  /** 长文本 → AI 解析成结构化偏好，合并回表单 */
  const aiParse = async () => {
    if (!p.note.trim()) {
      Taro.showToast({ title: '先写一段你的口味描述', icon: 'none' })
      return
    }
    setParsing(true)
    try {
      const res: any = await api.parsePreferences(p.note)
      if (!res?.ok) {
        Taro.showToast({ title: res?.reason || 'AI 解析失败', icon: 'none' })
        return
      }
      const d = res.prefs || {}
      setP((s) => {
        const next = { ...s }
        API_FIELDS.forEach((f) => {
          const v = d[f]
          if (v === null || v === undefined) return
          if (f === 'price_min' || f === 'price_max' || f === 'radius') next[f] = String(v)
          else if (f === 'note') next.note = s.note
          else if (Array.isArray(v)) {
            const merged = [...(next[f] as string[])]
            v.map(String).forEach((x: string) => {
              if (x && !merged.includes(x)) merged.push(x)
            })
            ;(next[f] as string[]) = merged
          }
        })
        return next
      })
      Taro.showToast({ title: '已解析填入，请确认后保存', icon: 'none' })
    } catch (e: any) {
      Taro.showToast({ title: 'AI 解析失败', icon: 'none' })
    } finally {
      setParsing(false)
    }
  }

  /** 导出：把偏好复制成 JSON，方便备份/换设备 */
  const exportPrefs = async () => {
    const text = JSON.stringify(toBody(), null, 2)
    try {
      await Taro.setClipboardData({ data: text })
    } catch {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          /* ignore */
        }
      }
    }
    Taro.showToast({ title: '已复制到剪贴板', icon: 'success' })
  }

  /** 导入：支持 JSON，或「每行一个」的纯文本（用 #喜欢 / #不喜欢 分段） */
  const doImport = () => {
    const raw = importText.trim()
    if (!raw) {
      Taro.showToast({ title: '请粘贴 JSON 或列表', icon: 'none' })
      return
    }
    const next = { ...EMPTY }
    if (raw.startsWith('{')) {
      try {
        const d = JSON.parse(raw)
        API_FIELDS.forEach((f) => {
          const v = d[f]
          if (v === null || v === undefined) return
          if (f === 'price_min' || f === 'price_max' || f === 'radius') next[f] = String(v)
          else if (f === 'note') next.note = String(v)
          else if (Array.isArray(v)) (next[f] as string[]) = v.map(String)
        })
      } catch {
        Taro.showToast({ title: 'JSON 格式不正确', icon: 'none' })
        return
      }
    } else {
      let target: 'brand_include' | 'brand_exclude' = 'brand_include'
      raw.split(/\r?\n/).forEach((line) => {
        const s = line.trim()
        if (!s) return
        if (/^#|^【|^\[/.test(s) || s.includes('不喜欢') || s.includes('排除') || s.includes('不吃')) {
          if (s.includes('不喜欢') || s.includes('排除') || s.includes('不吃')) target = 'brand_exclude'
          else if (s.includes('喜欢') || s.includes('想吃') || s.includes('偏好')) target = 'brand_include'
          return
        }
        const item = s.replace(/^[-*、,，]\s*/, '').trim()
        if (item && !next[target].includes(item)) next[target].push(item)
      })
    }
    setP(next)
    setImportOpen(false)
    setImportText('')
    Taro.showToast({ title: '已导入，请确认后保存', icon: 'none' })
  }

  return (
    <PageContainer
      title='我的偏好'
      subtitle='设一次、跨碰面复用；点「AI 智能解析」还能用一段话描述你的口味'
      icon='chopsticks'
      back
      crumb={['我的', '偏好']}
    >
      {loading ? (
        <Section title='加载中…' icon='chopsticks' tone='neutral'>
          <Text style={{ fontSize: 13, color: '#6b6b6b' }}>正在读取你的偏好…</Text>
        </Section>
      ) : (
        <>
          <Section title='喜欢的菜系' icon='fork' tone='orange'>
            <Chips options={CUISINE_OPTIONS} values={p.cuisine_include} onChange={(v) => set('cuisine_include', v)} />
            <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
              选中的菜系会额外检索并加分（高德本身不支持「喜欢」，我们在排序层实现）
            </Text>
          </Section>

          <Section title='不想吃的菜系' icon='end' tone='neutral'>
            <Chips
              options={CUISINE_OPTIONS}
              values={p.cuisine_exclude}
              onChange={(v) => set('cuisine_exclude', v)}
              color='#6b7280'
            />
          </Section>

          <Section title='想去的品牌 / 餐厅' icon='plus' tone='green'>
            <TagInput
              values={p.brand_include}
              onChange={(v) => set('brand_include', v)}
              placeholder='如：海底捞、星巴克（回车或点添加）'
              color='#10b981'
            />
          </Section>

          <Section title='不想去的品牌 / 餐厅' icon='end' tone='neutral'>
            <TagInput
              values={p.brand_exclude}
              onChange={(v) => set('brand_exclude', v)}
              placeholder='如：麦当劳'
              color='#6b7280'
            />
          </Section>

          <Section title='商圈优先' icon='pin' tone='blue'>
            <TagInput
              values={p.area_include}
              onChange={(v) => set('area_include', v)}
              placeholder='如：天河城、三里屯'
              color='#3b82f6'
            />
          </Section>

          <Section title='默认筛选' icon='target' tone='neutral'>
            <View style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Input
                placeholder='人均下限(元)'
                type='number'
                value={p.price_min}
                onInput={(e) => set('price_min', e.detail.value)}
                style={{ ...inputStyle, flex: '1 1 120px' }}
              />
              <Input
                placeholder='人均上限(元)'
                type='number'
                value={p.price_max}
                onInput={(e) => set('price_max', e.detail.value)}
                style={{ ...inputStyle, flex: '1 1 120px' }}
              />
            </View>
            <Text style={{ display: 'block', marginTop: 12, fontSize: 12, color: '#6b6b6b', marginBottom: 6 }}>
              搜索半径（高德 POI radius）
            </Text>
            <View style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RADIUS_OPTIONS.map((r) => {
                const on = String(r) === p.radius
                return (
                  <View
                    key={r}
                    onClick={() => set('radius', String(r))}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      background: on ? '#ff6b35' : '#fff',
                      border: `1px solid ${on ? '#ff6b35' : 'rgba(0,0,0,0.08)'}`,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: on ? '#fff' : '#6b7280' }}>
                      {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                    </Text>
                  </View>
                )
              })}
            </View>
          </Section>

          <Section title='用一段话描述（AI 解析）' icon='sparkle' tone='orange'>
            <Textarea
              value={p.note}
              onInput={(e) => set('note', e.detail.value)}
              placeholder='例如：我们俩都不吃辣，喜欢日料和火锅，人均别超 150，最好在天河城附近，别去麦当劳'
              style={{ width: '100%', minHeight: 84, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
            />
            <View style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Button
                size='mini'
                loading={parsing}
                onClick={aiParse}
                style={{ background: '#ff6b35', color: '#fff', borderRadius: 999, padding: '8px 16px' }}
              >
                AI 智能解析
              </Button>
              <Text style={{ fontSize: 12, color: '#9ca3af', lineHeight: '28px' }}>
                解析结果会合并到上面的选项，确认无误后再保存
              </Text>
            </View>
          </Section>

          <Section title='导入 / 导出' icon='copy' tone='neutral'>
            <View style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                size='mini'
                onClick={exportPrefs}
                style={{ background: '#fff', color: '#ff6b35', border: '1px solid #ff6b35', borderRadius: 999, padding: '8px 16px' }}
              >
                导出（复制 JSON）
              </Button>
              <Button
                size='mini'
                onClick={() => setImportOpen((v) => !v)}
                style={{ background: '#fff', color: '#6b7280', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 999, padding: '8px 16px' }}
              >
                {importOpen ? '收起导入' : '导入'}
              </Button>
            </View>
            {importOpen && (
              <View style={{ marginTop: 8 }}>
                <Textarea
                  value={importText}
                  onInput={(e) => setImportText(e.detail.value)}
                  placeholder={'粘贴导出的 JSON；或每行一个词，用「# 喜欢」「# 不喜欢」分段'}
                  style={{ width: '100%', minHeight: 90, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box' }}
                />
                <Button
                  size='mini'
                  onClick={doImport}
                  style={{ marginTop: 8, background: 'rgba(255,107,53,0.1)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 999, padding: '6px 14px' }}
                >
                  确认导入
                </Button>
              </View>
            )}
          </Section>

          <Button
            loading={saving}
            onClick={save}
            style={{
              background: '#ff6b35',
              color: '#fff',
              borderRadius: 999,
              padding: '12px 24px',
              fontSize: 15,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 4,
            }}
          >
            保存偏好 <Icon name='arrow' size={16} color='#fff' />
          </Button>
        </>
      )}
    </PageContainer>
  )
}
