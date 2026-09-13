import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../services/api'
import { amapGeocode } from '../utils/amap'
import MapPicker from './MapPicker'
import Icon from './Icon'

/** 一个被选中的「搜索中心」：坐标 + 可读地址 + 来源标签 */
export interface NearAddress {
  lat: number
  lng: number
  addr: string
  /** 来源说明，如「碰面中心」「商圈：人民广场」「碰面码 ABC123」「手动坐标」 */
  label: string
}

interface Props {
  /** 地图初始/重新居中的大概位置（一般传碰面中心） */
  defaultCenter?: { lat: number; lng: number } | null
  value?: NearAddress | null
  onChange: (v: NearAddress | null) => void
  /** 默认（未选自定义点时）的文案，如「用碰面中心」 */
  defaultLabel?: string
}

/**
 * 「地址附近」选择器：在地图选点 / 文字搜索（商圈·详细地址）/ 碰面码 / 手动经纬度
 * 四种方式里挑一个作为餐厅检索中心，输出 NearAddress 给餐厅列表。
 */
export default function NearAddressPicker({ defaultCenter, value, onChange, defaultLabel = '碰面中心' }: Props) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<{ lat: number; lng: number; addr: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [meetCode, setMeetCode] = useState('')
  const [resolving, setResolving] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [hint, setHint] = useState('')

  const pick = (lat: number, lng: number, addr: string, label: string) => {
    onChange({ lat, lng, addr, label })
    setOpen(false)
    setResults([])
    setKeyword('')
    setHint('')
    Taro.showToast({ title: '已设为搜索中心', icon: 'success' })
  }

  const search = async () => {
    if (!keyword.trim()) return
    setSearching(true)
    try {
      const list = await amapGeocode(keyword.trim())
      setResults(list)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '未找到地点', icon: 'none' })
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const resolveCode = async () => {
    const code = meetCode.trim().toUpperCase()
    if (!code) return
    setResolving(true)
    setHint('')
    try {
      const m: any = await api.getMeetup(code)
      let lat = m.center_lat
      let lng = m.center_lng
      if (lat == null || lng == null) {
        const c: any = await api.center(code)
        lat = c.center_lat
        lng = c.center_lng
      }
      pick(Number(lat), Number(lng), `碰面码 ${code} 的中心`, `碰面码 ${code}`)
    } catch (e: any) {
      setHint(e?.message || '该碰面码不存在或无法计算中心')
    } finally {
      setResolving(false)
    }
  }

  const applyCoord = () => {
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) {
      Taro.showToast({ title: '经纬度格式不正确', icon: 'none' })
      return
    }
    pick(lat, lng, `手动坐标 ${lat.toFixed(5)}, ${lng.toFixed(5)}`, '手动坐标')
  }

  const chooseFromMap = (p: { lat: number; lng: number; addr: string }) => {
    pick(p.lat, p.lng, p.addr, '地图选点')
  }

  // 已选自定义点：展示 + 可清除（回到默认碰面中心）
  if (value) {
    return (
      <View>
        <View
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            background: '#fff',
            borderRadius: 10,
            border: '1px solid rgba(255,107,53,0.3)',
          }}
        >
          <Icon name='pin' size={16} color='#ff6b35' />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 12, color: '#ff6b35' }}>{value.label}</Text>
            <Text style={{ display: 'block', fontSize: 13, color: '#2b2b2b', wordBreak: 'break-word' }}>
              {value.addr}
            </Text>
          </View>
          <View
            onClick={() => onChange(null)}
            style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 13, padding: '4px 8px' }}
          >
            清除
          </View>
        </View>
      </View>
    )
  }

  return (
    <View>
      <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 12, color: '#9ca3af' }}>当前搜索中心：{defaultLabel}</Text>
        <View
          onClick={() => setOpen((v) => !v)}
          style={{
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: '#ff6b35',
            fontSize: 13,
            border: '1px solid rgba(255,107,53,0.4)',
            borderRadius: 999,
            padding: '5px 12px',
          }}
        >
          <Icon name='pin' size={13} color='#ff6b35' />
          <Text>{open ? '收起' : '选择附近地址'}</Text>
        </View>
      </View>

      {open && (
        <View style={{ marginTop: 10 }}>
          {/* ① 地图选点 */}
          <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 6 }}>
            在地图上点选或拖动标记（可选商圈 / 详细地址附近）
          </Text>
          <MapPicker center={defaultCenter} onChange={chooseFromMap} height={240} />

          {/* ② 文字搜索（商圈·详细地址） */}
          <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 12, marginBottom: 6 }}>
            或搜索地点（商圈 / 详细地址）
          </Text>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input
              placeholder='如：上海市人民广场 / 中关村'
              value={keyword}
              onInput={(e) => setKeyword(e.detail.value)}
              style={{
                flex: 1,
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
              }}
            />
            <Button
              size='mini'
              loading={searching}
              onClick={search}
              style={{ background: '#ff6b35', color: '#fff', borderRadius: 999, padding: '8px 16px' }}
            >
              搜索
            </Button>
          </View>
          {results.length > 0 && (
            <View
              style={{
                marginTop: 8,
                maxHeight: 200,
                overflowY: 'auto',
                background: '#fff',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              {results.map((r, i) => (
                <View
                  key={i}
                  onClick={() => pick(r.lat, r.lng, r.addr, `地点：${r.addr}`)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: i < results.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <Icon name='pin' size={14} color='#ff6b35' />
                  <Text style={{ fontSize: 13, color: '#2b2b2b', flex: 1 }}>{r.addr}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ③ 碰面码 */}
          <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 12, marginBottom: 6 }}>
            或按某个碰面码计算的中心
          </Text>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input
              placeholder='输入碰面码，如 ABC123'
              value={meetCode}
              onInput={(e) => setMeetCode(e.detail.value)}
              style={{
                flex: 1,
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
                textTransform: 'uppercase',
              }}
            />
            <Button
              size='mini'
              loading={resolving}
              onClick={resolveCode}
              style={{ background: 'rgba(255,107,53,0.1)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 999, padding: '8px 16px' }}
            >
              用此碰面
            </Button>
          </View>
          {hint ? (
            <Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#b45309' }}>{hint}</Text>
          ) : null}

          {/* ④ 手动经纬度 */}
          <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 12, marginBottom: 6 }}>
            或手动输入经纬度
          </Text>
          <View style={{ display: 'flex', gap: 8 }}>
            <Input
              placeholder='纬度 lat'
              type='digit'
              value={manualLat}
              onInput={(e) => setManualLat(e.detail.value)}
              style={{ flex: 1, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
            />
            <Input
              placeholder='经度 lng'
              type='digit'
              value={manualLng}
              onInput={(e) => setManualLng(e.detail.value)}
              style={{ flex: 1, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
            />
            <Button
              size='mini'
              onClick={applyCoord}
              style={{ background: 'rgba(255,107,53,0.1)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 999, padding: '8px 16px' }}
            >
              使用
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
