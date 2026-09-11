import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../services/api'
import Section from './Section'
import Icon from './Icon'
import { amapLocate, amapGeocode } from '../utils/amap'
import {
  getStoredNickname,
  getDefaultNickname,
  saveNickname,
  fetchWechatNickname,
  isWeapp,
} from '../utils/user'
import { useResponsive, tokens } from '../hooks/useResponsive'

/** 持久化「我在此碰面中的参与者 id」的存储键（cookie 等价，免登录复用身份） */
export const joinKey = (code: string) => `eat_join_${code}`

interface Props {
  code: string
  /** 已加入的参与者 id（由父组件从 cookie 读取并下发，用于标记「你」与切换 UI） */
  joinedPid: string
  /** 碰面是否已结束 */
  ended: boolean
  /** 加入/更新成功后刷新父页面数据 */
  onChange: () => void
  /** 上报最新参与者 id */
  onJoined: (pid: string) => void
}

export default function JoinMeetup({ code, joinedPid, ended, onChange, onJoined }: Props) {
  const { mode } = useResponsive()
  const t = tokens(mode)

  const [nick, setNick] = useState<string>(() => getStoredNickname() || getDefaultNickname())
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [addr, setAddr] = useState('')
  const [precise, setPrecise] = useState(false)
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hint, setHint] = useState('')

  // 手动选择位置
  const [manualOpen, setManualOpen] = useState(false)
  const [kw, setKw] = useState('')
  const [results, setResults] = useState<{ lat: number; lng: number; addr: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')

  const locate = async () => {
    setLocating(true)
    setHint('')
    try {
      const p = await amapLocate()
      setLoc({ lat: p.lat, lng: p.lng })
      setAddr(p.addr || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)
      setPrecise(!!p.precise)
      if (!p.precise) {
        setHint('当前为局域网/HTTP 访问，浏览器无法精确定位，已使用网络定位（城市级）。可点「手动选择」精确到具体地点。')
      }
    } catch (e: any) {
      setHint('自动定位失败，请点「手动选择」输入地点')
      setManualOpen(true)
    } finally {
      setLocating(false)
    }
  }

  const search = async () => {
    if (!kw.trim()) return
    setSearching(true)
    try {
      const list = await amapGeocode(kw.trim())
      setResults(list)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '未找到地点', icon: 'none' })
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const pick = (p: { lat: number; lng: number; addr: string }) => {
    setLoc({ lat: p.lat, lng: p.lng })
    setAddr(p.addr)
    setPrecise(true)
    setHint('')
    setManualOpen(false)
    setResults([])
    setKw('')
    Taro.showToast({ title: '已选择位置', icon: 'success' })
  }

  const applyCoord = () => {
    const la = parseFloat(manualLat)
    const ln = parseFloat(manualLng)
    if (isNaN(la) || isNaN(ln)) {
      Taro.showToast({ title: '经纬度格式不正确', icon: 'none' })
      return
    }
    setLoc({ lat: la, lng: ln })
    setAddr(`手动坐标: ${la}, ${ln}`)
    setPrecise(true)
    setHint('')
    setManualOpen(false)
  }

  const useWechat = async () => {
    const n = await fetchWechatNickname()
    if (n) {
      setNick(n)
      Taro.showToast({ title: '已获取微信昵称', icon: 'success' })
    } else {
      Taro.showToast({ title: '未获取到，可手动输入', icon: 'none' })
    }
  }

  const doJoin = async () => {
    if (!loc) {
      Taro.showToast({ title: '请先获取或选择位置', icon: 'none' })
      return
    }
    const name = nick.trim() || getDefaultNickname()
    saveNickname(name)
    setSubmitting(true)
    try {
      const m: any = await api.joinMeetup(code, { nickname: name, lat: loc.lat, lng: loc.lng })
      const id = m?.my_participant_id as string | undefined
      if (id) {
        Taro.setStorageSync(joinKey(code), id)
        onJoined(id)
      }
      Taro.showToast({ title: '已加入碰面', icon: 'success' })
      onChange()
    } catch (e: any) {
      Taro.showToast({ title: '加入失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const doUpdate = async () => {
    if (!loc) {
      Taro.showToast({ title: '请先获取或选择位置', icon: 'none' })
      return
    }
    const name = nick.trim() || getDefaultNickname()
    saveNickname(name)
    setSubmitting(true)
    try {
      await api.updateParticipant(code, joinedPid, { nickname: name, lat: loc.lat, lng: loc.lng })
      Taro.showToast({ title: '位置已更新', icon: 'success' })
      onChange()
    } catch (e: any) {
      Taro.showToast({ title: '更新失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  // 已结束：仅展示状态
  if (ended) {
    return (
      <Section title='碰面状态' icon='end' tone='neutral'>
        <Text style={{ color: '#6b6b6b', fontSize: 13 }}>
          该碰面已结束，不能再加入。
        </Text>
      </Section>
    )
  }

  // 已加入：展示「你」+ 更新位置
  if (joinedPid) {
    return (
      <Section title='你已加入' icon='user' tone='green'>
        <View style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 12px',
              background: '#fff',
              borderRadius: 10,
              border: '1px solid rgba(16,185,129,0.2)',
            }}
          >
            <Text style={{ fontWeight: 600, color: '#059669' }}>昵称：{nick || '匿名用户'}</Text>
            <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 2 }}>
              {loc ? `位置：${addr}` : '尚未上报位置'}
            </Text>
          </View>
          <Button
            size='mini'
            loading={locating || submitting}
            onClick={locate}
            style={{
              background: 'rgba(16,185,129,0.1)',
              color: '#059669',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 999,
              padding: '8px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name='target' size={14} color='#059669' /> 更新我的位置
          </Button>
        </View>
        {hint ? (
          <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#9a6a00' }}>{hint}</Text>
        ) : null}
        <View style={{ marginTop: 10 }}>
          <Button
            size='mini'
            onClick={() => setManualOpen((v) => !v)}
            style={{
              background: '#fff',
              color: '#6b7280',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 999,
              padding: '6px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name='search' size={14} /> {manualOpen ? '收起' : '手动选择地点'}
          </Button>
        </View>
        {manualOpen && renderManual()}
      </Section>
    )
  }

  // 未加入：加入卡片
  return (
    <Section title='加入碰面' icon='plus' tone='orange'>
      <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 8 }}>
        填个昵称、报上位置，就能和朋友凑出最佳碰面点（无需登录）。
      </Text>

      {/* 昵称 */}
      <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Input
          placeholder='昵称（默认匿名用户xx）'
          value={nick}
          onInput={(e) => setNick(e.detail.value)}
          style={{
            flex: '1 1 180px',
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 14,
          }}
        />
        {isWeapp() && (
          <Button
            size='mini'
            onClick={useWechat}
            style={{
              background: 'rgba(16,185,129,0.1)',
              color: '#059669',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 999,
              padding: '8px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            用微信昵称
          </Button>
        )}
      </View>

      {/* 位置 */}
      <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button
          onClick={locate}
          loading={locating}
          style={{
            background: '#ff6b35',
            color: '#fff',
            borderRadius: 999,
            padding: '10px 18px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 14,
          }}
        >
          <Icon name='pin' size={16} color='#fff' /> {loc ? '重新定位' : '获取我的位置'}
        </Button>
        <Button
          size='mini'
          onClick={() => setManualOpen((v) => !v)}
          style={{
            background: 'rgba(255,255,255,0.7)',
            color: '#6b7280',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 999,
            padding: '8px 14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Icon name='search' size={14} /> 手动选择
        </Button>
      </View>

      <View
        style={{
          marginTop: 10,
          padding: 10,
          background: '#fff',
          borderRadius: 10,
          color: loc ? '#2b2b2b' : '#9ca3af',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon name='pin' size={14} color={loc ? '#ff6b35' : '#9ca3af'} />
        <Text>我的位置：{loc ? addr : '未获取'}</Text>
      </View>

      {hint ? (
        <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#9a6a00' }}>{hint}</Text>
      ) : null}

      {manualOpen && renderManual()}

      <Button
        onClick={doJoin}
        loading={submitting}
        disabled={!loc}
        style={{
          marginTop: 12,
          background: loc ? '#ff6b35' : 'rgba(255,107,53,0.4)',
          color: '#fff',
          borderRadius: 999,
          padding: '12px 24px',
          fontSize: 15,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        加入碰面 <Icon name='arrow' size={16} color='#fff' />
      </Button>
    </Section>
  )

  function renderManual() {
    return (
      <View style={{ marginTop: 10 }}>
        <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 6 }}>
          输入地点名搜索，或粘贴经纬度
        </Text>
        <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            placeholder='如：上海市人民广场'
            value={kw}
            onInput={(e) => setKw(e.detail.value)}
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
            style={{
              background: '#ff6b35',
              color: '#fff',
              borderRadius: 999,
              padding: '8px 16px',
            }}
          >
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
                <Icon name='pin' size={14} color='#ff6b35' />
                <Text style={{ fontSize: 13, color: '#2b2b2b', flex: 1 }}>{r.addr}</Text>
              </View>
            ))}
          </View>
        )}

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
              style={{
                flex: 1,
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
              }}
            />
            <Input
              placeholder='经度 lng'
              type='digit'
              value={manualLng}
              onInput={(e) => setManualLng(e.detail.value)}
              style={{
                flex: 1,
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
              }}
            />
          </View>
          <Button
            size='mini'
            onClick={applyCoord}
            style={{
              marginTop: 8,
              background: 'rgba(255,107,53,0.1)',
              color: '#ff6b35',
              border: '1px solid rgba(255,107,53,0.3)',
              borderRadius: 999,
              padding: '6px 14px',
            }}
          >
            使用此坐标
          </Button>
        </View>
      </View>
    )
  }
}
