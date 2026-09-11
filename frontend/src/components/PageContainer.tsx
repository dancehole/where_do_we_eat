import { Fragment, ReactNode } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useResponsive, tokens } from '../hooks/useResponsive'
import Icon, { IconName } from './Icon'
import BottomNav, { TabKey } from './BottomNav'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - 资产由 webpack 解析为 URL
import bgUrl from '../assets/bg.png'

export interface PageContainerProps {
  /** 页面标题（与 icon 组合显示在头部） */
  title?: ReactNode
  /** 副标题/描述 */
  subtitle?: ReactNode
  /** 头部小图标 */
  icon?: IconName
  /** 右上角操作区 */
  headerRight?: ReactNode
  children: ReactNode
  /** 内容垂直居中（splash 风格） */
  center?: boolean
  /** 强制最大宽度（不指定则按 mode 自动） */
  maxWidth?: number
  /** 关闭玻璃拟态背景（默认开启） */
  flat?: boolean
  /** 内容区外边距（不指定按 mode） */
  margin?: number
  /** 是否显示返回按钮（点击返回上一层级） */
  back?: boolean
  /** 面包屑层级，如 ['碰面', '发起碰面']，用于展示当前索引层级 */
  crumb?: string[]
  /** 当前所在的底部分类（高亮对应 tab，并展示底部导航） */
  tab?: TabKey
  /** 关闭底部导航（极少数全屏页用） */
  noNav?: boolean
}

/**
 * 统一页面布局：
 *  1) 固定全屏背景（背景图 + 暖色渐变 + 半透明白色蒙版）
 *  2) 居中内容卡片（玻璃拟态：半透白 + 模糊 + 圆角 + 细描边）
 *  3) 顶部返回/面包屑 + 底部四分类导航（首页/碰面/吃饭/我的）
 *  4) PC/平板端限制最大宽度并保留侧边留白，让背景可见；手机端保留小内边距
 *  仅 H5 有背景效果（小程序不响应此容器）
 */
export default function PageContainer({
  title,
  subtitle,
  icon,
  headerRight,
  children,
  center,
  maxWidth,
  flat,
  margin,
  back,
  crumb,
  tab,
  noNav,
}: PageContainerProps) {
  const { mode, isH5 } = useResponsive()
  const t = tokens(mode)
  const mw = maxWidth ?? t.maxWidth
  const mg = margin ?? (mode === 'mobile' ? 12 : 24)
  const showNav = !noNav

  const isFull = mw === 0
  const contentMaxWidth: number | string = isFull ? '100%' : mw
  const contentWidth: number | string = isFull ? '100%' : mw
  // 给底部导航留出空间，避免内容被遮挡
  const navPad = showNav ? (mode === 'mobile' ? 72 : 80) : 0

  const onBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack()
    else Taro.redirectTo({ url: '/pages/splash/index' })
  }

  return (
    <View style={{ minHeight: '100vh', position: 'relative' }}>
      {/* 背景层（H5） */}
      {isH5 && (
        <View
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 0,
            backgroundImage: `url("${bgUrl}"), linear-gradient(180deg, #fff7ed 0%, #fde8c9 100%)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: '#fff7ed',
          }}
        />
      )}
      {/* 提升可读性的半透明蒙版（很轻，不盖住插画） */}
      {isH5 && (
        <View
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 0,
            background:
              'linear-gradient(180deg, rgba(255,247,237,0.45) 0%, rgba(255,247,237,0.7) 60%, rgba(255,255,255,0.85) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 内容卡片 */}
      <View
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: contentMaxWidth,
          width: contentWidth,
          margin: isFull ? `0 auto` : `${mg}px auto`,
          padding: t.pad,
          paddingBottom: t.pad + navPad,
          minHeight: isFull ? '100vh' : `calc(100vh - ${mg * 2}px)`,
          display: 'flex',
          flexDirection: 'column',
          ...(center ? { justifyContent: 'center' } : {}),
          ...(flat
            ? {}
            : {
                background: 'rgba(255, 255, 255, 0.78)',
                backdropFilter: 'blur(14px) saturate(1.1)',
                WebkitBackdropFilter: 'blur(14px) saturate(1.1)',
                borderRadius: t.radius,
                border: '1px solid rgba(255, 255, 255, 0.6)',
                boxShadow:
                  '0 10px 30px rgba(180, 100, 40, 0.08), 0 2px 6px rgba(180, 100, 40, 0.04)',
              }),
        }}
      >
        {/* 顶部：返回 + 面包屑（展示当前索引层级） */}
        {(back || (crumb && crumb.length > 0)) && (
          <View
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: t.gap,
              color: '#6b6b6b',
              fontSize: 13,
              flexWrap: 'wrap',
            }}
          >
            {back && (
              <View
                onClick={onBack}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  cursor: 'pointer',
                  color: '#ff6b35',
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: 'rgba(255,107,53,0.10)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon name='back' size={16} color='#ff6b35' />
                <Text style={{ fontSize: 13, color: '#ff6b35' }}>返回</Text>
              </View>
            )}
            {crumb && crumb.length > 0 && (
              <View style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {crumb.map((c, i) => (
                  <Fragment key={i}>
                    {i > 0 && <Text style={{ color: '#cbd5e1' }}>/</Text>}
                    <Text
                      style={{
                        color: i === crumb.length - 1 ? '#2b2b2b' : '#6b6b6b',
                        fontWeight: i === crumb.length - 1 ? 700 : 400,
                      }}
                    >
                      {c}
                    </Text>
                  </Fragment>
                ))}
              </View>
            )}
          </View>
        )}

        {(title || subtitle || headerRight) && (
          <View
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: t.gap,
              gap: 12,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              {title && (
                <View
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#ff6b35',
                  }}
                >
                  {icon && <Icon name={icon} size={Math.round(t.titleSize * 1.05)} />}
                  <Text
                    style={{
                      fontSize: t.titleSize,
                      fontWeight: 700,
                      color: '#2b2b2b',
                    }}
                  >
                    {title}
                  </Text>
                </View>
              )}
              {subtitle && (
                <Text
                  style={{
                    display: 'block',
                    marginTop: 6,
                    fontSize: mode === 'mobile' ? 13 : 14,
                    color: '#6b6b6b',
                    lineHeight: 1.6,
                  }}
                >
                  {subtitle}
                </Text>
              )}
            </View>
            {headerRight}
          </View>
        )}
        {children}
      </View>

      {/* 底部四分类导航：一键回到首页/碰面/吃饭/我的 */}
      {showNav && <BottomNav active={tab} />}
    </View>
  )
}
