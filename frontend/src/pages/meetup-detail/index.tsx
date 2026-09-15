import { View, Text, Button, Image } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useStore } from '../../store'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import MapView from '../../components/MapView'
import JoinMeetup, { joinKey } from '../../components/JoinMeetup'
import ManualAddParticipant from '../../components/ManualAddParticipant'
import { useResponsive, tokens } from '../../hooks/useResponsive'
import { isWeapp } from '../../utils/user'

export default function MeetupDetail() {
  const router = useRouter()
  const code = router.params.code || ''
  const [m, setM] = useState<any>(null)
  const [center, setCenter] = useState<any>(null)
  // 本人在此碰面中的参与者 id（cookie 持久化，免登录复用身份，用于标记「你」与切换加入/已加入 UI）
  const [myPid, setMyPid] = useState<string>(() => Taro.getStorageSync(joinKey(code)) || '')
  const { mode } = useResponsive()
  const t = tokens(mode)
  const isDesktop = mode === 'desktop'

  // 微信分享卡片
  useShareAppMessage(() => ({
    title: `来碰面！碰面码 ${code}`,
    path: `/pages/meetup-detail/index?code=${code}`,
  }))

  const load = async () => setM(await api.getMeetup(code))
  useEffect(() => {
    load()
    if (code) useStore.getState().setLastCode(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const calcCenter = async () => setCenter(await api.center(code))
  const end = async () => {
    await api.endMeetup(code)
    Taro.showToast({ title: '已结束', icon: 'success' })
    load()
  }

  // 复制分享链接（链接来自后端 share_url，缺失时用当前 origin 兜底）
  const copyShare = async () => {
    const link =
      m?.share_url ||
      `${typeof window !== 'undefined' ? window.location.origin : ''}/#/pages/meetup-detail/index?code=${code}`
    try {
      await Taro.setClipboardData({ data: link })
    } catch {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(link)
        } catch {
          /* ignore */
        }
      }
    }
    Taro.showToast({ title: '链接已复制', icon: 'success' })
  }

  if (!m)
    return (
      <PageContainer
        title='碰面详情'
        icon='users'
        tab='meetup'
        back
        crumb={['碰面', code || '详情']}
      >
        <Text style={{ color: '#9ca3af' }}>加载中...</Text>
      </PageContainer>
    )

  return (
    <PageContainer
      title={`碰面 ${m.code}`}
      subtitle={`${m.participant_count} 个伙伴已加入`}
      icon='users'
      tab='meetup'
      back
      crumb={['碰面', m.code]}
      headerRight={
        <Button
          size='mini'
          onClick={end}
          style={{
            background: 'rgba(239,68,68,0.1)',
            color: '#dc2626',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 999,
            padding: '6px 14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
          }}
        >
          <Icon name='end' size={14} color='#dc2626' /> 结束
        </Button>
      }
    >
      {/* 加入 / 已加入 卡片（分享页核心：让点进来的每个人都能成为独立参与者） */}
      <JoinMeetup
        code={code}
        joinedPid={myPid}
        ended={m.status === 'ended'}
        onChange={load}
        onJoined={(pid) => setMyPid(pid)}
      />

      {/* 分享碰面：浏览器复制链接；小程序用 open-type=share 触发微信转发（携带碰面码，好友点开即加入） */}
      <Section title='分享碰面' icon='share' tone='green'>
        {isWeapp() ? (
          <View>
            <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 8 }}>
              点「邀请好友」通过微信转发，好友点开即可带着位置加入碰面。
            </Text>
            <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Button
                openType='share'
                size='mini'
                style={{
                  background: 'rgba(16,185,129,0.12)',
                  color: '#059669',
                  border: '1px solid rgba(16,185,129,0.35)',
                  borderRadius: 999,
                  padding: '8px 16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                }}
              >
                <Icon name='share' size={14} color='#059669' /> 邀请好友（微信转发）
              </Button>
              <Button
                size='mini'
                onClick={copyShare}
                style={{
                  background: 'rgba(16,185,129,0.1)',
                  color: '#059669',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: 999,
                  padding: '6px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                }}
              >
                <Icon name='copy' size={12} color='#059669' /> 复制链接
              </Button>
            </View>
          </View>
        ) : (
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text
              style={{
                flex: '1 1 200px',
                minWidth: 0,
                fontSize: 12,
                color: '#6b6b6b',
                wordBreak: 'break-all',
              }}
            >
              {m.share_url || `碰面码 ${m.code}`}
            </Text>
            <Button
              size='mini'
              onClick={copyShare}
              style={{
                background: 'rgba(16,185,129,0.1)',
                color: '#059669',
                border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: 999,
                padding: '6px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
              }}
            >
              <Icon name='copy' size={12} color='#059669' /> 复制链接
            </Button>
          </View>
        )}
      </Section>

      {/* 手动添加参与者：帮朋友报位置（昵称 + 地址） */}
      <ManualAddParticipant code={code} ended={m.status === 'ended'} onChange={load} />

      {isDesktop ? (
        <View
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)',
            gap: 20,
            alignItems: 'flex-start',
          }}
        >
          {/* 左：参与者 */}
          <View>
            <Section title={`参与者（${m.participants.length}）`} icon='users' tone='blue'>
              <View style={{ display: 'grid', gap: 10 }}>
                {m.participants.map((p: any, idx: number) => (
                  <View
                    key={p.id}
                    style={{
                      padding: 12,
                      background: '#fff',
                      borderRadius: 10,
                      border: '1px solid rgba(0,0,0,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    {p.avatar ? (
                      <Image
                        src={p.avatar}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 999,
                          border: '1px solid rgba(0,0,0,0.06)',
                          flexShrink: 0,
                        }}
                        mode='aspectFill'
                      />
                    ) : (
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 999,
                          background:
                            idx === 0 ? 'rgba(255,107,53,0.15)' : 'rgba(59,130,246,0.15)',
                          color: idx === 0 ? '#ff6b35' : '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {p.nickname?.[0] || '?'}
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontWeight: 600, color: '#2b2b2b' }}>
                        {p.nickname}
                        {p.id === myPid && (
                          <Text style={{ color: '#059669', fontSize: 12 }}>（你）</Text>
                        )}
                      </Text>
                      <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b' }}>
                        {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                      </Text>
                    </View>
                    {p.distance_km != null && (
                      <Text style={{ fontSize: 12, color: '#6b6b6b' }}>{p.distance_km} km</Text>
                    )}
                  </View>
                ))}
              </View>
            </Section>
          </View>

          {/* 右：地图 + 中心 */}
          <View>
            <Section title='碰面位置' icon='target' tone='orange'>
              <Button
                onClick={calcCenter}
                style={{
                  background: '#ff6b35',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '10px 20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 14,
                }}
              >
                <Icon name='target' size={14} color='#fff' /> 计算碰面中心
              </Button>
              {center && (
                <View style={{ marginTop: 12 }}>
                  <View
                    style={{
                      padding: 10,
                      background: '#fff',
                      borderRadius: 10,
                      fontSize: 13,
                      color: '#2b2b2b',
                    }}
                  >
                    <Text style={{ fontWeight: 600 }}>
                      {center.meetup_type === 'same_city' ? '同城聚餐' : '跨城旅行'}
                    </Text>
                    <Text style={{ display: 'block', color: '#6b6b6b', fontSize: 12, marginTop: 2 }}>
                      中心 {center.center_lat.toFixed(4)}, {center.center_lng.toFixed(4)}
                    </Text>
                  </View>
                  <View style={{ marginTop: 10 }}>
                    <MapView
                      center={{ lat: center.center_lat, lng: center.center_lng }}
                      markers={[
                        ...m.participants.map((p: any) => ({
                          lat: p.lat,
                          lng: p.lng,
                          title: p.nickname,
                        })),
                        {
                          lat: center.center_lat,
                          lng: center.center_lng,
                          title: '碰面中心',
                        },
                      ]}
                    />
                  </View>
                  {center.meetup_type === 'same_city' && (
                    <Button
                      size='mini'
                      onClick={() =>
                        Taro.navigateTo({ url: `/pages/restaurant-list/index?code=${code}` })
                      }
                      style={{
                        marginTop: 12,
                        background: '#fff',
                        color: '#ff6b35',
                        border: '1px solid #ff6b35',
                        borderRadius: 999,
                        padding: '8px 16px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name='fork' size={14} /> 找吃饭地方
                    </Button>
                  )}
                </View>
              )}
            </Section>
          </View>
        </View>
      ) : (
        // 移动/平板：单列
        <View>
          <Section title={`参与者（${m.participants.length}）`} icon='users' tone='blue'>
            <View style={{ display: 'grid', gap: 8 }}>
              {m.participants.map((p: any) => (
                <View
                  key={p.id}
                  style={{
                    padding: 12,
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  {p.avatar ? (
                    <Image
                      src={p.avatar}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        border: '1px solid rgba(0,0,0,0.06)',
                        flexShrink: 0,
                      }}
                      mode='aspectFill'
                    />
                  ) : (
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        background: 'rgba(59,130,246,0.15)',
                        color: '#3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {p.nickname?.[0] || '?'}
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: 600 }}>
                      {p.nickname}
                      {p.id === myPid && <Text style={{ color: '#059669' }}>（你）</Text>}
                    </Text>
                    <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b' }}>
                      （{p.lat.toFixed(3)}, {p.lng.toFixed(3)}）
                      {p.distance_km != null && ` · 距我 ${p.distance_km} km`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          <Section title='碰面位置' icon='target' tone='orange'>
            <Button
              onClick={calcCenter}
              style={{
                background: '#ff6b35',
                color: '#fff',
                borderRadius: 999,
                padding: '10px 20px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
              }}
            >
              <Icon name='target' size={14} color='#fff' /> 查看碰面位置
            </Button>
            {center && (
              <View
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: '#fff',
                  borderRadius: 10,
                }}
              >
                <Text>
                  类型：
                  {center.meetup_type === 'same_city' ? '同城聚餐' : '跨城旅行'}
                </Text>
                <Text style={{ display: 'block' }}>
                  中心：{center.center_lat.toFixed(4)}, {center.center_lng.toFixed(4)}
                </Text>
              </View>
            )}
            {center && (
              <View style={{ marginTop: 10 }}>
                <MapView
                  center={{ lat: center.center_lat, lng: center.center_lng }}
                  markers={[
                    ...m.participants.map((p: any) => ({
                      lat: p.lat,
                      lng: p.lng,
                      title: p.nickname,
                    })),
                    { lat: center.center_lat, lng: center.center_lng, title: '碰面中心' },
                  ]}
                />
                {center.meetup_type === 'same_city' && (
                  <Button
                    size='mini'
                    onClick={() =>
                      Taro.navigateTo({ url: `/pages/restaurant-list/index?code=${code}` })
                    }
                    style={{
                      marginTop: 8,
                      background: '#fff',
                      color: '#ff6b35',
                      border: '1px solid #ff6b35',
                      borderRadius: 999,
                      padding: '6px 14px',
                    }}
                  >
                    找吃饭地方
                  </Button>
                )}
              </View>
            )}
          </Section>
        </View>
      )}
    </PageContainer>
  )
}
