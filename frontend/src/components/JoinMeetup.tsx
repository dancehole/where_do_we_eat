import { View, Text, Button, Input, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect, ReactNode } from 'react'
import { api } from '../services/api'
import Section from './Section'
import Icon, { IconName } from './Icon'
import MapPicker from './MapPicker'
import { amapLocate, amapGeocode, getLocateEnv } from '../utils/amap'
import {
  getStoredNickname,
  getDefaultNickname,
  saveNickname,
  fetchWechatProfile,
  weappLogin,
  isWeapp,
} from '../utils/user'
import { useResponsive, tokens } from '../hooks/useResponsive'

/** 持久化「我在此碰面中的参与者 id」的存储键（cookie 等价，免登录复用身份） */
export const joinKey = (code: string) => `eat_join_${code}`

interface Props {
  code: string
  /** 已加入的参与者 id（由父组件从 cookie 读取并下发，用于标记「你」与切换 UI） */
  joinedPid: string
  /** 已加入时，本人已上报的位置（用于回显，避免显示「尚未上报」） */
  initialLoc?: { lat: number; lng: number; addr?: string } | null
  /** 碰面是否已结束 */
  ended: boolean
  /** 加入/更新成功后刷新父页面数据 */
  onChange: () => void
  /** 上报最新参与者 id */
  onJoined: (pid: string) => void
}

export default function JoinMeetup({ code, joinedPid, initialLoc, ended, onChange, onJoined }: Props) {
  const { mode } = useResponsive()
  const t = tokens(mode)

  // 昵称默认值：浏览器用「匿名用户xx」；小程序留空，提示用户用微信昵称/头像（需用户手势授权）
  const [nick, setNick] = useState<string>(() =>
    getStoredNickname() || (isWeapp() ? '' : getDefaultNickname())
  )
  const [avatar, setAvatar] = useState('')
  const [wechatId, setWechatId] = useState('')
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(
    initialLoc ? { lat: initialLoc.lat, lng: initialLoc.lng } : null
  )
  const [addr, setAddr] = useState(initialLoc?.addr || '')
  const [precise, setPrecise] = useState(false)
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hint, setHint] = useState('')

  // 小程序端：进入即静默换取 openid（更稳定的微信身份），失败则回退设备匿名身份
  useEffect(() => {
    if (!isWeapp()) return
    weappLogin().then((oid) => {
      if (oid) setWechatId(oid)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 手动选择位置
  const [manualOpen, setManualOpen] = useState(false)
  const [kw, setKw] = useState('')
  const [results, setResults] = useState<{ lat: number; lng: number; addr: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  /** 地图选点的「大概位置」中心（自动定位/搜索结果），仅用于让地图落在对的地方 */
  const [pickCenter, setPickCenter] = useState<{ lat: number; lng: number } | null>(null)
  /** 「其他方式」（手动输入经纬度）是否展开——次选，默认折叠 */
  const [otherOpen, setOtherOpen] = useState(false)

  const toggleManual = () => {
    setManualOpen((v) => {
      const next = !v
      if (next) setPickCenter((c) => c || loc)
      return next
    })
  }

  const locate = async (): Promise<{ lat: number; lng: number; addr: string; precise: boolean } | null> => {
    setLocating(true)
    setHint('')
    try {
      const p = await amapLocate()
      const addr = p.addr || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
      setLoc({ lat: p.lat, lng: p.lng })
      setAddr(addr)
      setPickCenter({ lat: p.lat, lng: p.lng })
      setPrecise(!!p.precise)
      if (!p.precise) {
        const env = getLocateEnv()
        setHint(
          env.secure
            ? '已使用网络定位（城市级，非精确）。想精确到具体地点请点「手动选择」。'
            : `当前是非安全上下文（${env.protocol}//${env.host}），浏览器精确定位被禁用，已改用网络定位（城市级）。想用浏览器精确定位请改用 https 访问（https://${env.host}），或点「手动选择」。`
        )
      }
      return { lat: p.lat, lng: p.lng, addr, precise: !!p.precise }
    } catch (e: any) {
      setHint('自动定位失败：' + (e?.message || '未知原因') + '（可点「手动选择」输入地点）')
      setManualOpen(true)
      return null
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
    setPickCenter({ lat: p.lat, lng: p.lng })
    setResults([])
    setKw('')
    Taro.showToast({ title: '已选该地点', icon: 'success' })
    // 已加入时，选点后直接落库，无需再点保存
    if (joinedPid) saveMyInfo({ lat: p.lat, lng: p.lng })
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
    setPickCenter({ lat: la, lng: ln })
  }

  const useWechat = async () => {
    const prof = await fetchWechatProfile()
    if (prof) {
      if (prof.nickname) {
        setNick(prof.nickname)
        saveNickname(prof.nickname)
      }
      if (prof.avatarUrl) setAvatar(prof.avatarUrl)
      Taro.showToast({ title: '已获取微信昵称/头像', icon: 'success' })
      // 已加入时顺手把资料落库；未加入时等「加入碰面」时再提交
      if (joinedPid) await saveMyInfo()
    } else {
      Taro.showToast({ title: '未获取到，可手动输入', icon: 'none' })
    }
  }

  const doJoin = async () => {
    if (!loc) {
      Taro.showToast({ title: '请先获取或选择位置', icon: 'none' })
      return
    }
    const name = nick.trim() || (isWeapp() ? '微信用户' : getDefaultNickname())
    saveNickname(name)
    setSubmitting(true)
    try {
      const m: any = await api.joinMeetup(code, {
        nickname: name,
        lat: loc.lat,
        lng: loc.lng,
        avatar: avatar || undefined,
        wechat_id: wechatId || undefined,
      })
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

  /**
   * 保存「我」的资料：昵称 + 头像必存；位置可选（传入 explicitLoc 或当前 loc）。
   * 后端 update_participant 所有字段均可选，因此只改昵称也能单独提交。
   */
  const saveMyInfo = async (explicitLoc?: { lat: number; lng: number }) => {
    const L = explicitLoc || loc
    const name = nick.trim() || (isWeapp() ? '微信用户' : getDefaultNickname())
    saveNickname(name)
    setSubmitting(true)
    try {
      await api.updateParticipant(code, joinedPid, {
        nickname: name,
        avatar: avatar || undefined,
        ...(L ? { lat: L.lat, lng: L.lng } : {}),
      })
      Taro.showToast({ title: '资料已保存', icon: 'success' })
      onChange()
    } catch (e: any) {
      Taro.showToast({ title: '保存失败：' + (e?.message || '未知原因'), icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  /** 重新定位并把新位置落库（已加入时刷新自己的位置用） */
  const refreshMyLocation = async () => {
    const p = await locate()
    if (p) await saveMyInfo({ lat: p.lat, lng: p.lng })
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

  // 已加入：用折叠板块把「用户信息 / 我的位置」分组，避免按钮挤在一起
  if (joinedPid) {
    return (
      <Section title='你已加入' icon='user' tone='green'>
        {/* 摘要：头像 + 昵称 +（你） */}
        <View style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {avatar ? (
            <Image
              src={avatar}
              style={{ width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(16,185,129,0.3)', flexShrink: 0 }}
              mode='aspectFill'
            />
          ) : (
            <View
              style={{ width: 44, height: 44, borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}
            >
              {(nick || '匿名用户')?.[0] || '?'}
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: 600, fontSize: 15, color: '#059669' }}>
              {nick || '匿名用户'}
              <Text style={{ fontSize: 12, color: '#10b981' }}>（你）</Text>
            </Text>
          </View>
        </View>

        {/* 用户信息：手动昵称（免登录）+ 微信昵称/头像 */}
        <FoldPanel title='用户信息' icon='user' defaultOpen>
          <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 8 }}>
            手动填写昵称即可参与（无需登录）；也可一键带入微信昵称/头像。
          </Text>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {avatar && (
              <Image
                src={avatar}
                style={{ width: 34, height: 34, borderRadius: 999, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}
                mode='aspectFill'
              />
            )}
            <Input
              placeholder='昵称（手动输入，免登录）'
              value={nick}
              onInput={(e) => setNick(e.detail.value)}
              style={{ flex: '1 1 180px', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '0 12px', height: 42, fontSize: 14 }}
            />
          </View>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {isWeapp() && (
              <Button
                size='mini'
                onClick={useWechat}
                style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 999, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Icon name='user' size={14} color='#059669' /> 用微信昵称/头像
              </Button>
            )}
            <Button
              size='mini'
              loading={submitting}
              onClick={() => saveMyInfo()}
              style={{ background: '#fff', color: '#059669', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 999, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              保存资料
            </Button>
          </View>
        </FoldPanel>

        {/* 我的位置：查看/更新 + 手动选点 */}
        <FoldPanel title='我的位置' icon='pin' defaultOpen>
          <View
            style={{ padding: 10, background: '#fff', borderRadius: 10, fontSize: 13, color: loc ? '#2b2b2b' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}
          >
            <Icon name='pin' size={14} color={loc ? '#ff6b35' : '#9ca3af'} />
            <Text>当前位置：{loc ? addr : '尚未上报'}</Text>
          </View>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size='mini'
              loading={locating || submitting}
              onClick={refreshMyLocation}
              style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 999, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Icon name='target' size={14} color='#059669' /> 更新我的位置
            </Button>
            <Button
              size='mini'
              onClick={toggleManual}
              style={{ background: '#fff', color: '#6b7280', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 999, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Icon name='search' size={14} /> {manualOpen ? '收起选点' : '手动选择地点'}
            </Button>
          </View>
          {hint ? (
            <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#9a6a00' }}>{hint}</Text>
          ) : null}
          {manualOpen && renderManual()}
        </FoldPanel>
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
        {avatar && (
          <Image
            src={avatar}
            style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}
            mode='aspectFill'
          />
        )}
        <Input
          placeholder={isWeapp() ? '昵称（点「用微信昵称/头像」）' : '昵称（默认匿名用户xx）'}
          value={nick}
          onInput={(e) => setNick(e.detail.value)}
          style={{
            flex: '1 1 180px',
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 10,
            padding: '0 12px',
            height: 42,
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
            用微信昵称/头像
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
          onClick={toggleManual}
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
        {/* 地图选点：以「大概位置」为中心，点选/拖动标记选具体位置 */}
        <MapPicker
          center={pickCenter}
          height={220}
          onChange={(p) => {
            setLoc({ lat: p.lat, lng: p.lng })
            setAddr(p.addr)
            setPrecise(true)
            setHint('')
          }}
        />
        <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 10, marginBottom: 6 }}>
          也可以搜索地点，地图会自动移到该处
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

        {/* 其他方式（次选，默认折叠）：手动输入经纬度 */}
        <View
          onClick={() => setOtherOpen((v) => !v)}
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            color: '#6b7280',
            fontSize: 12,
          }}
        >
          <Text>{otherOpen ? '▾ 收起「其他方式」' : '▸ 其他方式（手动输入经纬度）'}</Text>
        </View>

        {otherOpen && (
          <View style={{ marginTop: 8 }}>
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
        )}
      </View>
    )
  }
}

/**
 * 轻量折叠面板（用于「你已加入」内部把信息/位置分组），避免按钮挤在一起。
 * 与 Section 不嵌套成重型卡片：只是一条可点击的标题栏 + 内容区。
 */
function FoldPanel({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: ReactNode
  icon?: IconName
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View style={{ marginTop: 12 }}>
      <View
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.7)',
          borderRadius: 8,
          gap: 8,
        }}
      >
        <View style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon && <Icon name={icon} size={15} color='#ff6b35' />}
          <Text style={{ fontSize: 13, fontWeight: 600, color: '#2b2b2b' }}>{title}</Text>
        </View>
        <Icon name={open ? 'chevron_down' : 'chevron_right'} size={15} color='#9ca3af' />
      </View>
      {open && <View style={{ padding: '10px 2px 2px' }}>{children}</View>}
    </View>
  )
}
