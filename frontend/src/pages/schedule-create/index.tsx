import { View, Text, Button, Input, Textarea, Picker, Switch } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../../services/api'
import { useStore } from '../../store'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import { useResponsive, tokens } from '../../hooks/useResponsive'
import { fmtDate, todayStr, scheduleJoinKey } from '../../utils/schedule'

function addDays(n: number): string {
  const d = new Date()
  const base = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  return fmtDate(new Date(base.getTime() + n * 86400000))
}

const PRESETS = [
  { label: '近 3 天', days: 2 },
  { label: '近 1 周', days: 6 },
  { label: '近 2 周', days: 13 },
  { label: '近 1 月', days: 29 },
]

export default function ScheduleCreate() {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [start, setStart] = useState(todayStr())
  const [end, setEnd] = useState(addDays(6))
  const [granular, setGranular] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { mode } = useResponsive()
  const t = tokens(mode)

  const applyPreset = (days: number) => {
    setStart(todayStr())
    setEnd(addDays(days))
  }

  const create = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (end < start) {
      Taro.showToast({ title: '结束日期不能早于开始', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const m: any = await api.createSchedule({
        title: title.trim(),
        description: desc.trim() || undefined,
        start_date: start,
        end_date: end,
        granular_hours: granular,
        nickname: '我',
      })
      if (m.my_participant_id) {
        Taro.setStorageSync(scheduleJoinKey(m.code), m.my_participant_id)
      }
      Taro.showToast({ title: '已创建，去邀请吧', icon: 'success' })
      Taro.redirectTo({ url: `/pages/schedule-detail/index?code=${m.code}` })
    } catch (e: any) {
      Taro.showToast({ title: '创建失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer
      title='新建排期'
      subtitle='定一个时间段，让大家勾选有空的日子'
      icon='calendar'
      tab='schedule'
      back
      crumb={['排期', '新建']}
    >
      <Section title='基本信息' icon='sparkle' tone='orange'>
        <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 6 }}>标题</Text>
        <Input
          placeholder='如：确认吃饭时间'
          value={title}
          onInput={(e) => setTitle(e.detail.value)}
          style={inputStyle}
        />
        <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', margin: '12px 0 6px' }}>描述（可选）</Text>
        <Textarea
          placeholder='如：勾选这两周大致有空的时间'
          value={desc}
          onInput={(e) => setDesc(e.detail.value)}
          maxlength={200}
          style={{ ...inputStyle, height: 72, paddingTop: 10 }}
        />
      </Section>

      <Section title='时间段' icon='calendar' tone='blue'>
        <View style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <View style={{ flex: '1 1 140px' }}>
            <Text style={{ fontSize: 12, color: '#6b6b6b' }}>开始</Text>
            <Picker mode='date' value={start} onChange={(e) => setStart(e.detail.value)}>
              <View style={pickerBox}>{start}</View>
            </Picker>
          </View>
          <View style={{ flex: '1 1 140px' }}>
            <Text style={{ fontSize: 12, color: '#6b6b6b' }}>结束</Text>
            <Picker mode='date' value={end} onChange={(e) => setEnd(e.detail.value)}>
              <View style={pickerBox}>{end}</View>
            </Picker>
          </View>
        </View>
        <View style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {PRESETS.map((p) => (
            <View
              key={p.label}
              onClick={() => applyPreset(p.days)}
              style={{
                padding: '6px 12px', borderRadius: 999, background: '#fff',
                border: '1px solid rgba(255,107,53,0.3)', color: '#ff6b35',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              {p.label}
            </View>
          ))}
        </View>
        <Text style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginTop: 10 }}>
          时间段可后续在详情页修改。
        </Text>
      </Section>

      <Section title='精度' icon='rule' tone='green'>
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ fontSize: 14, color: '#2b2b2b', fontWeight: 600 }}>精确到小时</Text>
            <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 2 }}>
              开启后按 2 小时为界，可细化到 9:00-11:00 等 6 个时段
            </Text>
          </View>
          <Switch checked={granular} onChange={(e) => setGranular(e.detail.value)} color='#ff6b35' />
        </View>
      </Section>

      <Button
        onClick={create}
        loading={submitting}
        style={{
          marginTop: 4, background: '#ff6b35', color: '#fff', borderRadius: 999,
          padding: '12px 24px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        创建排期 <Icon name='arrow' size={16} color='#fff' />
      </Button>
    </PageContainer>
  )
}

const inputStyle = {
  background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
  padding: '10px 12px', fontSize: 14, width: '100%',
}
const pickerBox = {
  marginTop: 4, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
  padding: '10px 12px', fontSize: 14, color: '#2b2b2b',
}
