import { View, Text, Button, Input, Image } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage, useDidHide } from '@tarojs/taro'
import { useState, useEffect, useRef } from 'react'
import { api } from '../../services/api'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import AvailabilityBrush from '../../components/AvailabilityBrush'
import ScheduleGridEditor from '../../components/ScheduleGridEditor'
import ScheduleHeatmap from '../../components/ScheduleHeatmap'
import { useResponsive, tokens } from '../../hooks/useResponsive'
import { isWeapp, getDefaultNickname, getStoredNickname, saveNickname, fetchWechatProfile, weappLogin } from '../../utils/user'
import { eachDate, scheduleJoinKey, countPending, Level } from '../../utils/schedule'

export default function ScheduleDetail() {
  const router = useRouter()
  const code = router.params.code || ''
  const [m, setM] = useState<any>(null)
  const [merge, setMerge] = useState<any>(null)
  const [myPid, setMyPid] = useState<string>(() => Taro.getStorageSync(scheduleJoinKey(code)) || '')
  const [avail, setAvail] = useState<any>({})
  const [brush, setBrush] = useState<Level>('yes')
  const [nick, setNick] = useState<string>(() => getStoredNickname() || (isWeapp() ? '' : getDefaultNickname()))
  const [avatar, setAvatar] = useState('')
  const [wechatId, setWechatId] = useState('')
  const [joining, setJoining] = useState(false)
  const [pendingOthers, setPendingOthers] = useState(0)
  const { mode } = useResponsive()
  const t = tokens(mode)
  const saveTimer = useRef<any>(null)
  const availRef = useRef<any>({})
  const myPidRef = useRef<string>('')
  const dirtyRef = useRef(false)
  // 保存状态：idle 未修改 / dirty 有改动待保存 / saving 保存中 / saved 已保存 / error 保存失败
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState('')

  // 供事件回调（含防抖 setTimeout / 卸载钩子）读取最新值
  availRef.current = avail
  myPidRef.current = myPid

  /** 立即把「我」的作答写回后端（同时清掉待触发的防抖） */
  const flushSave = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const pid = myPidRef.current
    if (!dirtyRef.current || !pid) return
    dirtyRef.current = false
    setSaveState('saving')
    api
      .saveAvailability(code, pid, availRef.current)
      .then(() => {
        setSaveState('saved')
        setSavedAt(nowLabel())
      })
      .catch(() => {
        dirtyRef.current = true
        setSaveState('error')
      })
  }

  // 切到后台 / 离开页面时兜底保存，避免 800ms 内退出丢失最后一次修改
  useDidHide(() => flushSave())
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const pid = myPidRef.current
      if (dirtyRef.current && pid) {
        api.saveAvailability(code, pid, availRef.current).catch(() => {})
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useShareAppMessage(() => ({
    title: `来排期！一起约个有空的时间 ${code}`,
    path: `/pages/schedule-detail/index?code=${code}`,
  }))

  const load = async () => {
    const detail: any = await api.getSchedule(code, myPid || undefined)
    setM(detail)
    if (detail.my_participant_id) {
      setMyPid(detail.my_participant_id)
      Taro.setStorageSync(scheduleJoinKey(code), detail.my_participant_id)
      setAvail(detail.my_availability || {})
    } else {
      setAvail({})
    }
    try {
      const mg: any = await api.mergeSchedule(code)
      setMerge(mg)
      if (detail.is_creator) {
        const n = (mg.participants || []).filter((p: any) => p.pending > 0 && p.id !== detail.my_participant_id).length
        setPendingOthers(n)
      }
    } catch {
      setMerge(null)
    }
  }
  useEffect(() => {
    load()
    if (isWeapp()) weappLogin().then((oid) => oid && setWechatId(oid))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onAvailChange = (next: any) => {
    setAvail(next)
    availRef.current = next
    if (!myPid || m?.status === 'closed') return
    // 标脏 + 800ms 防抖自动保存；期间界面显示「有改动」
    dirtyRef.current = true
    setSaveState('dirty')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => flushSave(), 800)
  }

  const doJoin = async () => {
    const name = nick.trim() || (isWeapp() ? '微信用户' : getDefaultNickname())
    saveNickname(name)
    setJoining(true)
    try {
      const r: any = await api.joinSchedule(code, {
        nickname: name, avatar: avatar || undefined, wechat_id: wechatId || undefined,
      })
      if (r.my_participant_id) {
        Taro.setStorageSync(scheduleJoinKey(code), r.my_participant_id)
        setMyPid(r.my_participant_id)
        setAvail(r.my_availability || {})
      }
      Taro.showToast({ title: '已加入', icon: 'success' })
      load()
    } catch {
      Taro.showToast({ title: '加入失败', icon: 'none' })
    } finally {
      setJoining(false)
    }
  }

  const useWechat = async () => {
    const prof = await fetchWechatProfile()
    if (prof) {
      if (prof.nickname) { setNick(prof.nickname); saveNickname(prof.nickname) }
      if (prof.avatarUrl) setAvatar(prof.avatarUrl)
    }
  }

  const copyShare = async () => {
    const link = m?.share_url || `${typeof window !== 'undefined' ? window.location.origin : ''}/#/pages/schedule-detail/index?code=${code}`
    try { await Taro.setClipboardData({ data: link }) } catch { /* ignore */ }
    Taro.showToast({ title: '链接已复制', icon: 'success' })
  }

  const toggleLock = async () => {
    try {
      if (m.status === 'open') await api.closeSchedule(code)
      else await api.openSchedule(code)
      Taro.showToast({ title: m.status === 'open' ? '已锁定' : '已重新开启', icon: 'success' })
      load()
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  if (!m)
    return (
      <PageContainer title='排期详情' icon='calendar' tab='schedule' back crumb={['排期', code || '详情']}>
        <Text style={{ color: '#9ca3af' }}>加载中...</Text>
      </PageContainer>
    )

  const locked = m.status === 'closed'
  const myPending = countPending(avail)
  const days = eachDate(m.start_date, m.end_date)

  // 提醒横幅
  const ReminderBanner = () => {
    if (!myPid) return null
    if (myPending > 0) {
      return (
        <View style={bannerStyle('#fef3c7', '#92400e')}>
          <Icon name='rule' size={16} color='#92400e' />
          <Text style={{ fontSize: 13, color: '#92400e' }}>
            你还有 {myPending} 个「待确认」项，建议改为「有空 / 没空」
          </Text>
        </View>
      )
    }
    if (m.is_creator && pendingOthers > 0) {
      return (
        <View style={bannerStyle('#fee2e2', '#b91c1c')}>
          <Icon name='rule' size={16} color='#b91c1c' />
          <Text style={{ fontSize: 13, color: '#b91c1c' }}>
            还有 {pendingOthers} 人「待确认」，可提醒他们尽快确定
          </Text>
        </View>
      )
    }
    return null
  }

  return (
    <PageContainer
      title={m.title}
      subtitle={`${m.start_date} ~ ${m.end_date}${m.granular_hours ? ' · 精确到小时' : ''} · ${m.participant_count} 人`}
      icon='calendar'
      tab='schedule'
      back
      crumb={['排期', m.code]}
      headerRight={
        <View
          style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 999,
            background: locked ? 'rgba(0,0,0,0.06)' : 'rgba(16,185,129,0.12)',
            color: locked ? '#6b7280' : '#059669',
          }}
        >
          {locked ? '已锁定' : '编辑中'}
        </View>
      }
    >
      {/* 信息 */}
      <Section title='排期信息' icon='calendar' tone='orange'>
        {m.description ? (
          <Text style={{ display: 'block', fontSize: 13, color: '#4b5563', marginBottom: 8 }}>{m.description}</Text>
        ) : null}
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: '#6b6b6b' }}>
          <Text>时间段：{m.start_date} ~ {m.end_date}</Text>
          <Text>精度：{m.granular_hours ? '精确到小时' : '按天'}</Text>
        </View>
      </Section>

      {/* 分享 */}
      <Section title='分享排期' icon='share' tone='green'>
        {isWeapp() ? (
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 6, width: '100%' }}>
              点「邀请好友」通过微信转发，好友点开即可加入并勾选时间。
            </Text>
            <Button openType='share' size='mini' style={btnGreen}>邀请好友（微信转发）</Button>
            <Button size='mini' onClick={copyShare} style={btnGreenOutline}>复制链接</Button>
          </View>
        ) : (
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ flex: '1 1 200px', minWidth: 0, fontSize: 12, color: '#6b6b6b', wordBreak: 'break-all' }}>
              {m.share_url || `排期码 ${m.code}`}
            </Text>
            <Button size='mini' onClick={copyShare} style={btnGreenOutline}>复制链接</Button>
          </View>
        )}
      </Section>

      {/* 加入（未加入时） */}
      {!myPid && !locked && (
        <Section title='加入排期' icon='plus' tone='blue'>
          <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 8 }}>
            填个昵称即可加入，和大家一起勾选有空的时间（无需登录）。
          </Text>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {avatar && <Image src={avatar} style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid rgba(0,0,0,0.08)' }} mode='aspectFill' />}
            <Input
              placeholder={isWeapp() ? '昵称（点「用微信昵称/头像」）' : '昵称（默认匿名用户xx）'}
              value={nick}
              onInput={(e) => setNick(e.detail.value)}
              style={{ flex: '1 1 180px', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
            />
            {isWeapp() && (
              <Button size='mini' onClick={useWechat} style={btnGreenOutline}>用微信</Button>
            )}
          </View>
          <Button onClick={doJoin} loading={joining} style={btnOrange}>
            加入排期 <Icon name='arrow' size={16} color='#fff' />
          </Button>
        </Section>
      )}
      {!myPid && locked && (
        <Section title='排期状态' icon='end' tone='neutral'>
          <Text style={{ color: '#6b6b6b', fontSize: 13 }}>该排期已锁定，不能再加入。</Text>
        </Section>
      )}

      {/* 参与者 */}
      <Section title={`参与者（${m.participants.length}）`} icon='users' tone='blue'>
        <View style={{ display: 'grid', gap: 8 }}>
          {m.participants.map((p: any, idx: number) => (
            <View key={p.id} style={{ padding: 10, background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
              {p.avatar ? (
                <Image src={p.avatar} style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid rgba(0,0,0,0.06)' }} mode='aspectFill' />
              ) : (
                <View style={{ width: 32, height: 32, borderRadius: 999, background: idx === 0 ? 'rgba(255,107,53,0.15)' : 'rgba(59,130,246,0.15)', color: idx === 0 ? '#ff6b35' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                  {(p.nickname || '?')[0]}
                </View>
              )}
              <Text style={{ fontWeight: 600 }}>
                {p.nickname}
                {p.id === myPid && <Text style={{ color: '#059669' }}>（你）</Text>}
                {m.creator_id === p.id && <Text style={{ color: '#ff6b35', fontSize: 12 }}>（发起者）</Text>}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      {/* 我的排期（核心编辑器） */}
      {myPid && !locked && (
        <Section title='我的排期' icon='calendar' tone='orange'>
          <AvailabilityBrush value={brush} onChange={setBrush} />
          <View style={{ marginTop: 10 }}>
            <ScheduleGridEditor
              availability={avail}
              days={days}
              granular={m.granular_hours}
              brush={brush}
              onChange={onAvailChange}
            />
          </View>

          {/* 保存状态 + 手动保存：修改是「改动后 800ms 自动保存」，此处给明确反馈与兜底入口 */}
          <View
            style={{
              marginTop: 12, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
            }}
          >
            <View style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <View
                style={{
                  width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                  background: SAVE_META[saveState].dot,
                }}
              />
              <Text style={{ fontSize: 12, color: SAVE_META[saveState].color }}>
                {saveState === 'saved' ? `已自动保存 ${savedAt}` : SAVE_META[saveState].text}
              </Text>
            </View>
            <Button
              size='mini'
              onClick={flushSave}
              disabled={saveState === 'saving' || saveState === 'idle'}
              style={{
                background: saveState === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(255,107,53,0.12)',
                color: saveState === 'error' ? '#dc2626' : '#ff6b35',
                border: `1px solid ${saveState === 'error' ? 'rgba(239,68,68,0.35)' : 'rgba(255,107,53,0.35)'}`,
                borderRadius: 999, padding: '5px 12px', fontSize: 12,
              }}
            >
              立即保存
            </Button>
          </View>

          <Text style={{ display: 'block', marginTop: 10, fontSize: 12, color: '#9a6a00' }}>
            勾选后会自动保存（停止操作约 1 秒落盘），离开页面也会兜底保存一次。排期可随时修改，直到发起者关闭编辑（比如确定好、买票了）。
          </Text>
        </Section>
      )}

      {/* 提醒横幅放在编辑器「下方」：它的内容会随作答变化而出现/消失，
          若放在顶部会让整个网格上下位移 —— 表现为「点这格却改到了上一格」。
          ⚠️ 不要再把它移回网格上方。 */}
      <ReminderBanner />

      {/* 锁定后：只读合并图 */}
      {myPid && locked && (
        <Section title='合并结果（已锁定）' icon='target' tone='neutral'>
          {merge ? (
            <ScheduleHeatmap merge={merge} onCellClick={() => {}} />
          ) : (
            <Text style={{ color: '#9ca3af', fontSize: 13 }}>加载中...</Text>
          )}
        </Section>
      )}

      {/* 合并排期入口 */}
      <Section title='合并排期' icon='target' tone='green'>
        <Button
          onClick={() => Taro.navigateTo({ url: `/pages/schedule-merge/index?code=${code}` })}
          style={btnGreen}
        >
          <Icon name='target' size={14} color='#059669' /> 查看合并结果
        </Button>
      </Section>

      {/* 发起者专属：锁定 / 开启 */}
      {m.is_creator && (
        <Section title='编辑权限' icon='rule' tone='neutral'>
          <Button onClick={toggleLock} style={locked ? btnGreenOutline : btnRed}>
            {locked ? '重新开启编辑' : '关闭编辑（锁定）'}
          </Button>
        </Section>
      )}
    </PageContainer>
  )
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const SAVE_META: Record<SaveState, { dot: string; color: string; text: string }> = {
  idle: { dot: '#d1d5db', color: '#9ca3af', text: '尚未修改' },
  dirty: { dot: '#f59e0b', color: '#b45309', text: '有改动，即将自动保存…' },
  saving: { dot: '#3b82f6', color: '#2563eb', text: '保存中…' },
  saved: { dot: '#10b981', color: '#059669', text: '已自动保存' },
  error: { dot: '#ef4444', color: '#dc2626', text: '保存失败，请点「立即保存」重试' },
}

function nowLabel(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const bannerStyle = (bg: string, color: string) => ({
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
  padding: '10px 12px', background: bg, borderRadius: 10,
})
const btnOrange = {
  marginTop: 12, background: '#ff6b35', color: '#fff', borderRadius: 999,
  padding: '12px 24px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6,
}
const btnGreen = {
  background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.35)',
  borderRadius: 999, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13,
}
const btnGreenOutline = {
  background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)',
  borderRadius: 999, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
}
const btnRed = {
  background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 999, padding: '10px 20px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14,
}
