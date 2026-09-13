import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../../services/api'
import { useStore } from '../../store'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import MapView from '../../components/MapView'
import MapPicker from '../../components/MapPicker'
import { amapLocate, amapGeocode, getLocateEnv, weappReverseGeocode } from '../../utils/amap'
import { joinKey } from '../../components/JoinMeetup'
import { useResponsive, tokens } from '../../hooks/useResponsive'

export default function MeetupCreate() {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [addr, setAddr] = useState('未获取')
  const [locating, setLocating] = useState(false)
  /** 定位诊断提示（降级原因 / 失败原因），直接展示在页面上，便于排查 */
  const [locHint, setLocHint] = useState('')

  // 手动选择位置
  const [manualOpen, setManualOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<{ lat: number; lng: number; addr: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  /** 地图选点时的「大概位置」中心（自动定位/搜索得到的城市级坐标），只用于让地图初始落在对的地方 */
  const [pickCenter, setPickCenter] = useState<{ lat: number; lng: number } | null>(null)
  /** 「其他方式」（手动输入经纬度）是否展开——次选，默认折叠 */
  const [otherOpen, setOtherOpen] = useState(false)

  // 打开手动选择时，若还没有中心点，就用已定位到的大概位置作为地图中心
  const toggleManual = () => {
    setManualOpen((v) => {
      const next = !v
      if (next) setPickCenter((c) => c || loc)
      return next
    })
  }

  // ⚠️ 必须用构建期常量判断：Taro 在 H5 下 getEnv() 返回 'WEB'，写 'h5' 会恒为 false，
  // 导致 H5 端不走 amapLocate()（四级兜底），而去调 Taro.getLocation 直接失败。
  const isH5 = process.env.TARO_ENV === 'h5'
  const { mode } = useResponsive()
  const t = tokens(mode)
  const isDesktop = mode === 'desktop'

  // 自动获取位置
  const getLocation = async () => {
    setLocating(true)
    setLocHint('')
    try {
      if (isH5) {
        const p = await amapLocate()
        setLoc({ lat: p.lat, lng: p.lng })
        setAddr(p.addr || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)
        // 让后续打开的「地图选点」落在这次定位到的大概位置
        setPickCenter({ lat: p.lat, lng: p.lng })
        if (!p.precise) {
          const env = getLocateEnv()
          setLocHint(
            env.secure
              ? '已使用网络定位（城市级，非精确）。想精确到具体地点请点「手动选择位置」。'
              : `当前是非安全上下文（${env.protocol}//${env.host}），浏览器精确定位被禁用，已改用网络定位（城市级）。改用 https 访问可启用精确定位。`
          )
        }
        return
      }
      const res = await Taro.getLocation({ type: 'gcj02' })
      setLoc({ lat: res.latitude, lng: res.longitude })
      // 小程序端 Taro.getLocation 只给坐标，用服务端逆地理编码补一个可读地址
      const a = await weappReverseGeocode(res.latitude, res.longitude).catch(() => '')
      setAddr(a || `${res.latitude.toFixed(4)}, ${res.longitude.toFixed(4)}`)
    } catch (e: any) {
      Taro.showToast({ title: '自动定位失败，请看下方原因', icon: 'none' })
      setLocHint('自动定位失败：' + (e?.message || '未知原因') + '（可点「手动选择位置」）')
      setManualOpen(true)
    } finally {
      setLocating(false)
    }
  }

  // 地址关键词搜索
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

  const pick = (p: { lat: number; lng: number; addr: string }) => {
    setLoc({ lat: p.lat, lng: p.lng })
    setAddr(p.addr)
    // 地图移到搜索到的地点，用户可继续在图上微调
    setPickCenter({ lat: p.lat, lng: p.lng })
    setLocHint('')
    setResults([])
    setKeyword('')
    Taro.showToast({ title: '已选该地点', icon: 'success' })
  }

  const applyCoord = () => {
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) {
      Taro.showToast({ title: '经纬度格式不正确', icon: 'none' })
      return
    }
    setLoc({ lat, lng })
    setAddr(`手动坐标: ${lat}, ${lng}`)
    setPickCenter({ lat, lng })
    setLocHint('')
    Taro.showToast({ title: '已设置位置', icon: 'success' })
  }

  const create = async () => {
    if (!loc) {
      Taro.showToast({ title: '请先获取或手动选择位置', icon: 'none' })
      return
    }
    const m = await api.createMeetup({ nickname: '我', lat: loc.lat, lng: loc.lng })
    // 记录本人参与者 id：打开自己分享链接时识别为「已加入」，不会重复加入
    if (m.my_participant_id) Taro.setStorageSync(joinKey(m.code), m.my_participant_id)
    useStore.getState().setMeetupCode(m.code)
    Taro.showToast({ title: '已发起，进入碰面', icon: 'success' })
    // 自动进入碰面界面（分享/加人都可在详情页完成）
    Taro.navigateTo({ url: `/pages/meetup-detail/index?code=${m.code}` })
  }

  // 桌面端两栏：左 = 表单，右 = 地图
  const form = (
    <>
      <Section title='我的位置' icon='pin' tone='orange'>
        <View style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button
            onClick={getLocation}
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
            <Icon name='pin' size={16} color='#fff' /> 获取我的位置
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
              fontSize: 13,
            }}
          >
            <Icon name='search' size={14} /> {manualOpen ? '收起手动选择' : '手动选择位置'}
          </Button>
        </View>

        <View
          style={{
            marginTop: 12,
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
          <Text>我在：{addr}</Text>
        </View>

        {locHint ? (
          <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#9a6a00', wordBreak: 'break-word' }}>
            {locHint}
          </Text>
        ) : null}
      </Section>

      {manualOpen && (
        <Section title='手动选择位置' icon='search'>
          {/* 地图选点：以「大概位置」为中心，用户点选/拖动标记选具体位置 */}
          <MapPicker
            center={pickCenter}
            onChange={(p) => {
              setLoc({ lat: p.lat, lng: p.lng })
              setAddr(p.addr)
              setLocHint('')
            }}
          />

          <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 10, marginBottom: 8 }}>
            也可以搜索地点，地图会自动移到该处
          </Text>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input
              placeholder='如：上海市人民广场'
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
                maxHeight: mode === 'mobile' ? 220 : 280,
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
              marginTop: 12,
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
        </Section>
      )}

      <Button
        onClick={create}
        style={{
          background: '#ff6b35',
          color: '#fff',
          borderRadius: 999,
          padding: '12px 24px',
          fontSize: 15,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 4,
        }}
      >
        发起碰面 <Icon name='arrow' size={16} color='#fff' />
      </Button>

    </>
  )

  // 桌面端右侧地图
  const mapPanel = loc && (
    <View
      style={{
        position: isDesktop ? 'sticky' : 'static',
        top: isDesktop ? 20 : undefined,
        alignSelf: isDesktop ? 'flex-start' : 'stretch',
      }}
    >
      <Section title='地图预览' icon='pin' flush>
        <MapView
          center={loc}
          markers={[{ lat: loc.lat, lng: loc.lng, title: '我' }]}
        />
      </Section>
      {isDesktop && !loc && (
        <Section>
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>先在上方获取位置，这里会显示地图</Text>
        </Section>
      )}
    </View>
  )

  // 移动端/平板：地图在表单下方
  const mobileMap = !isDesktop && loc && (
    <Section title='地图预览' icon='pin' flush>
      <MapView
        center={loc}
        markers={[{ lat: loc.lat, lng: loc.lng, title: '我' }]}
      />
    </Section>
  )

  return (
    <PageContainer
      title='发起新的碰面'
      subtitle='告诉朋友你所在的位置，凑出最佳碰面点'
      icon='plus'
      tab='meetup'
      back
      crumb={['碰面', '发起碰面']}
    >
      {isDesktop ? (
        <View
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
            gap: 20,
            alignItems: 'flex-start',
          }}
        >
          <View>{form}</View>
          <View>{mapPanel}</View>
        </View>
      ) : (
        <View>
          {form}
          {mobileMap}
        </View>
      )}
    </PageContainer>
  )
}
