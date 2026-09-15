import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../services/api'
import Section from './Section'
import Icon from './Icon'
import { amapGeocode } from '../utils/amap'
import { useResponsive } from '../hooks/useResponsive'

interface Props {
  code: string
  /** 碰面是否已结束（结束则不再允许添加） */
  ended: boolean
  /** 添加成功后刷新父页面数据 */
  onChange: () => void
}

const inputStyle: any = {
  flex: '1 1 160px',
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
}

const primaryBtn: any = {
  background: '#3b82f6',
  color: '#fff',
  borderRadius: 999,
  padding: '10px 22px',
  fontSize: 15,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: any = {
  background: 'rgba(59,130,246,0.1)',
  color: '#3b82f6',
  border: '1px solid rgba(59,130,246,0.3)',
  borderRadius: 999,
  padding: '8px 14px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 13,
}

export default function ManualAddParticipant({ code, ended, onChange }: Props) {
  const { mode } = useResponsive()

  const [nick, setNick] = useState('')
  const [kw, setKw] = useState('')
  const [results, setResults] = useState<{ lat: number; lng: number; addr: string }[]>([])
  const [sel, setSel] = useState<{ lat: number; lng: number; addr: string } | null>(null)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const search = async () => {
    if (!kw.trim()) return
    setSearching(true)
    try {
      const list = await amapGeocode(kw.trim())
      setResults(list)
      if (!list.length) Taro.showToast({ title: '未找到地点，换个词试试', icon: 'none' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '未找到地点', icon: 'none' })
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const pick = (p: { lat: number; lng: number; addr: string }) => {
    setSel(p)
    setResults([])
    setKw(p.addr)
    Taro.showToast({ title: '已选择位置', icon: 'success' })
  }

  const applyCoord = () => {
    const la = parseFloat(manualLat)
    const ln = parseFloat(manualLng)
    if (isNaN(la) || isNaN(ln)) {
      Taro.showToast({ title: '经纬度格式不正确', icon: 'none' })
      return
    }
    setSel({ lat: la, lng: ln, addr: `手动坐标: ${la}, ${ln}` })
    Taro.showToast({ title: '已设置位置', icon: 'success' })
  }

  const add = async () => {
    if (!sel) {
      Taro.showToast({ title: '请先搜索并选择地址', icon: 'none' })
      return
    }
    const name = nick.trim() || '朋友'
    setSubmitting(true)
    try {
      await api.addLocation(code, { nickname: name, lat: sel.lat, lng: sel.lng })
      Taro.showToast({ title: '已添加参与者', icon: 'success' })
      setNick('')
      setKw('')
      setSel(null)
      setManualLat('')
      setManualLng('')
      setResults([])
      onChange()
    } catch {
      Taro.showToast({ title: '添加失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  if (ended) return null

  return (
    <Section title='手动添加参与者' icon='plus' tone='blue' collapsible defaultOpen={false}>
      <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 8 }}>
        帮朋友报个位置：填昵称 + 地址（或地图选点），TA 不必自己操作也能出现在碰面里。
      </Text>

      {/* 昵称 */}
      <Input
        placeholder='朋友昵称（默认「朋友」）'
        value={nick}
        onInput={(e) => setNick(e.detail.value)}
        style={inputStyle}
      />

      {/* 地址搜索 */}
      <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Input
          placeholder='地址，如：上海市人民广场'
          value={kw}
          onInput={(e) => setKw(e.detail.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <Button size='mini' loading={searching} onClick={search} style={ghostBtn}>
          搜索
        </Button>
      </View>

      {results.length > 0 && (
        <View
          style={{
            marginTop: 8,
            maxHeight: mode === 'mobile' ? 200 : 260,
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          {results.map((r, i) => (
            <View
              key={i}
              onClick={() => pick(r)}
              style={{
                padding: '10px 12px',
                borderBottom: i < results.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <Icon name='pin' size={14} color='#3b82f6' />
              <Text style={{ fontSize: 13, color: '#2b2b2b', flex: 1 }}>{r.addr}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 手动经纬度兜底 */}
      <View style={{ marginTop: 10 }}>
        <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 6 }}>
          或直接输入经纬度（gcj02）
        </Text>
        <View style={{ display: 'flex', gap: 8 }}>
          <Input
            placeholder='纬度 lat'
            type='digit'
            value={manualLat}
            onInput={(e) => setManualLat(e.detail.value)}
            style={inputStyle}
          />
          <Input
            placeholder='经度 lng'
            type='digit'
            value={manualLng}
            onInput={(e) => setManualLng(e.detail.value)}
            style={inputStyle}
          />
        </View>
        <Button size='mini' onClick={applyCoord} style={{ ...ghostBtn, marginTop: 8 }}>
          使用此坐标
        </Button>
      </View>

      {/* 已选位置回显 */}
      {sel && (
        <View
          style={{
            marginTop: 10,
            padding: 10,
            background: '#fff',
            borderRadius: 10,
            border: '1px solid rgba(59,130,246,0.2)',
          }}
        >
          <Text style={{ fontSize: 13, color: '#2b2b2b' }}>
            已选：{sel.addr}（{sel.lat.toFixed(4)}, {sel.lng.toFixed(4)}）
          </Text>
        </View>
      )}

      <Button
        onClick={add}
        loading={submitting}
        disabled={!sel}
        style={{
          ...primaryBtn,
          marginTop: 12,
          opacity: sel ? 1 : 0.5,
        }}
      >
        <Icon name='plus' size={16} color='#fff' /> 添加参与者
      </Button>
    </Section>
  )
}
