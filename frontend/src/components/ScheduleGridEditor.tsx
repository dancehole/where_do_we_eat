import { Fragment, useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import {
  Level, SLOTS, LEVEL_META, levelFill, dayLevel, slotLevel,
  setDayLevel, setSlotLevel, cycleLevel, EMPTY_FILL, todayStr,
  shortDate, weekdayLabel, splitSlot,
} from '../utils/schedule'
import { ScheduleGesture, TOUCH_MOUSE_GUARD_MS } from '../utils/scheduleGesture'
import { useGridMetrics, GRID_PAD } from '../utils/scheduleLayout'
import ScheduleMonthGrid from './ScheduleMonthGrid'

/** 格子列数：全天 + 6 个时段（左侧日期标签列不计在内） */
const COLS = SLOTS.length + 1

interface Props {
  availability: any
  days: string[]
  granular: boolean
  /** 当前画笔等级（受控，由父级 AvailabilityBrush 共享） */
  brush: Level
  /** 只读模式（合并热度图复用网格样式时）不显示画笔、禁用编辑，点击触发 onCellClick */
  readOnly?: boolean
  /** 编辑态：作答变化回调 */
  onChange?: (next: any) => void
  /** 只读态：点击某格回调（用于钻取） */
  onCellClick?: (date: string, slot: string | null) => void
}

function cellKey(date: string, slot: string | null) {
  return `${date}__${slot ?? 'day'}`
}

function cellAtPoint(x: number, y: number): string | null {
  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const el: any = document.elementFromPoint(x, y)
    const host = el && el.closest ? el.closest('[data-cell]') : null
    return host ? host.getAttribute('data-cell') : null
  }
  return null
}

/** 从 Taro 的鼠标/触摸事件里取屏幕坐标（H5 给 clientX，小程序给 detail.x/y） */
function ptOf(e: any): { x: number; y: number } {
  const tp = e?.touches?.[0] || e?.changedTouches?.[0]
  return {
    x: e?.clientX ?? e?.detail?.x ?? tp?.clientX ?? 0,
    y: e?.clientY ?? e?.detail?.y ?? tp?.clientY ?? 0,
  }
}

/** 是否触摸设备（决定「手指拖动」是涂抹还是滚动，以及是否显示该切换） */
function detectTouch(): boolean {
  if (process.env.TARO_ENV !== 'h5') return true
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0)
}

export default function ScheduleGridEditor({
  availability,
  days,
  granular,
  brush,
  readOnly,
  onChange,
  onCellClick,
}: Props) {
  const today = todayStr()
  const [isTouch] = useState(detectTouch)
  /** 手指拖动 = 涂抹（true，默认）/ 查看（false，交给浏览器滚动） */
  const [paintOnDrag, setPaintOnDrag] = useState(true)

  /** 响应式尺寸：手机自适应铺满+横滚；PC 铺满父容器（格子高度按列宽反推）。
   *  量容器宽度要用 boxRef（见下面网格容器上的 ref），所以尺寸放在 hook 里统一算。 */
  const { boxRef, grid } = useGridMetrics(COLS, granular)
  const isWide = grid.isWide

  /** 手机端编辑时禁用纵向滚动：涂抹模式完全不滚（none），查看模式只让横向滚矩阵（pan-x）；
   *  页面纵向翻页改由网格两侧空白区承担。只读（合并图）则交给浏览器默认行为。 */
  const gridTouch: 'none' | 'pan-x' | 'auto' = readOnly
    ? 'auto'
    : paintOnDrag ? 'none' : 'pan-x'

  /** 网格列模板：PC 用 1fr 铺满父容器；手机自适应铺满 + 塞不下横向拖动 */
  const TEMPLATE = grid.template
  /** 网格内芯：PC 宽度 100%（上限 CONTENT_MAX_W，超宽屏才居中）；手机给 minWidth 保证可横滚 */
  const innerStyle = isWide
    ? {
        display: 'block', padding: GRID_PAD, width: '100%', maxWidth: grid.contentMaxW,
        margin: '0 auto', boxSizing: 'border-box' as const,
      }
    : { display: 'block', padding: GRID_PAD, minWidth: grid.minWidth, boxSizing: 'border-box' as const }

  /* ── 手势 ───────────────────────────────────────────────────────────────────
   * 状态机在 utils/scheduleGesture（纯逻辑、可单测），这里只负责挂 DOM 监听：
   *  · touchMode：触摸后 700ms 内屏蔽浏览器合成的鼠标事件（否则一次轻点走两格）
   *  · click 捕获拦截：吞掉拖动结束后补发的那一次 click（否则可能误点画笔/多循环一次）
   * 目标：一次轻点 = 恰好一次循环；一次拖动 = 涂抹且不触发循环。 */
  const gRef = useRef<ScheduleGesture | null>(null)
  if (!gRef.current) gRef.current = new ScheduleGesture()
  /** 触摸手势进行中：屏蔽合成鼠标事件 */
  const touchMode = useRef(false)

  // ── 写入：单击循环 ──────────────────────────────────────────────────────────
  // ⚠️ 这里曾经有个致命 bug：setDayLevel 的签名是 (av, date, level)，
  //    却按 setSlotLevel 的 (av, date, slot, level) 传了 4 个参数，
  //    导致 level 实际拿到的是 slot=null → 「全天」列永远只会写成「未作答」，
  //    表现就是「全天那一列点不动 / 涂抹没反应」。按天模式下唯一可点的就是全天列，
  //    所以会表现为整页都点不动。
  const cycle = (date: string, slot: string | null) => {
    if (!onChange) return
    const cur = slot ? slotLevel(availability, date, slot) : dayLevel(availability, date)
    const next = cycleLevel(cur)
    const nv = slot
      ? setSlotLevel(availability, date, slot, next)
      : setDayLevel(availability, date, next)
    onChange(nv)
  }

  // ── 整行 / 整列快捷填充（都用当前画笔） ──────────────────────────────────────
  /** 点日期标签：当天「全天」+ 6 个时段一起填成画笔色 */
  const fillWholeDay = (date: string) => {
    if (!onChange) return
    let nv = setDayLevel(availability, date, brush)
    for (const s of SLOTS) nv = setSlotLevel(nv, date, s, brush)
    onChange(nv)
  }
  /** 点时段表头：该时段所有日期填成画笔色 */
  const fillSlotColumn = (slot: string) => {
    if (!onChange) return
    let nv = availability || {}
    for (const d of days) nv = setSlotLevel(nv, d, slot, brush)
    onChange(nv)
  }
  /** 点「全天」表头：所有日期的「全天」填成画笔色 */
  const fillDayColumn = () => {
    if (!onChange) return
    let nv = availability || {}
    for (const d of days) nv = setDayLevel(nv, d, brush)
    onChange(nv)
  }

  // ── 手势 ────────────────────────────────────────────────────────────────────
  /** 起点格：首次涂抹时会补上；小程序端（无 document）也用它做兜底目标 */
  const startRef = useRef<{ date: string; slot: string | null }>({ date: '', slot: null })
  const startAt = (date: string, slot: string | null, e: any) => {
    const p = ptOf(e)
    startRef.current = { date, slot }
    gRef.current!.begin(p.x, p.y, cellKey(date, slot))
  }
  /** 坐标 → 格子 key；H5 用 elementFromPoint，解析不到（滑出网格）就返回 null 不涂抹 */
  const resolveCell = (x: number, y: number): string | null => {
    const hit = cellAtPoint(x, y)
    if (hit) return hit
    if (typeof document === 'undefined') {
      const s = startRef.current
      return cellKey(s.date, s.slot)
    }
    return null
  }
  /**
   * 一次性涂抹多个格子。
   * ⚠️ 必须在这里把结果累积到同一个对象上再回调：availability 来自 props，
   *    同一个事件里连续调用 onChange 会都基于同一份旧值，后面的会覆盖前面的。
   */
  const paintCells = (keys: string[]) => {
    if (!onChange || !keys.length) return
    let acc = availability
    for (const k of keys) {
      const [date, slotRaw] = k.split('__')
      acc = slotRaw === 'day' ? setDayLevel(acc, date, brush) : setSlotLevel(acc, date, slotRaw, brush)
    }
    onChange(acc)
  }
  const moveTo = (touch: boolean, e: any) => {
    if (readOnly) return
    const p = ptOf(e)
    // 涂抹模式才在拖动时写入；查看模式把拖动让给浏览器（滚矩阵 / 滚页面）
    const res = gRef.current!.move(p.x, p.y, touch ? paintOnDrag : true, resolveCell)
    if (res.paints.length) paintCells(res.paints)
  }
  const finish = () => gRef.current!.end(Date.now())

  useEffect(() => {
    if (readOnly || typeof document === 'undefined') return
    const up = () => finish()
    document.addEventListener('mouseup', up)
    document.addEventListener('touchend', up)
    document.addEventListener('touchcancel', up)

    // 触摸手势期间 + 之后一段时间，屏蔽合成鼠标事件，避免「一次轻点走两格」
    let timer: any = null
    const tsOn = () => {
      touchMode.current = true
      if (timer) clearTimeout(timer)
    }
    const tsOff = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        touchMode.current = false
      }, TOUCH_MOUSE_GUARD_MS)
    }
    document.addEventListener('touchstart', tsOn, true)
    document.addEventListener('touchend', tsOff, true)
    document.addEventListener('touchcancel', tsOff, true)

    return () => {
      document.removeEventListener('mouseup', up)
      document.removeEventListener('touchend', up)
      document.removeEventListener('touchcancel', up)
      document.removeEventListener('touchstart', tsOn, true)
      document.removeEventListener('touchend', tsOff, true)
      document.removeEventListener('touchcancel', tsOff, true)
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // 拖动刚结束 → 吞掉紧随其后的那一次 click（window 捕获阶段最先执行，只吞一次）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const kill = (e: any) => {
      if (gRef.current!.consumeSuppressedClick(Date.now())) {
        e.preventDefault?.()
        e.stopPropagation?.()
        e.stopImmediatePropagation?.()
      }
    }
    window.addEventListener('click', kill, true)
    return () => window.removeEventListener('click', kill, true)
  }, [])

  const handleCellDown = (date: string, slot: string | null) => (e: any) => {
    if (readOnly || touchMode.current) return
    startAt(date, slot, e)
  }
  const handleCellTouchStart = (date: string, slot: string | null) => (e: any) => {
    if (readOnly) return
    startAt(date, slot, e)
  }
  const handleCellClick = (date: string, slot: string | null) => () => {
    if (readOnly) {
      if (onCellClick) onCellClick(date, slot)
      return
    }
    cycle(date, slot)
  }

  const onMouseMoveEv = (e: any) => moveTo(false, e)
  const onTouchMoveEv = (e: any) => moveTo(true, e)

  const hint = readOnly
    ? ''
    : granular
    ? paintOnDrag
      ? '选好画笔后按住拖动即可批量涂抹；轻点单格循环 未答 → 有空 → 可能有空 → 可能没空 → 没空。点日期标签整天填充，点时段表头整列填充。'
      : '轻点单格循环切换等级；左右拖动可查看全部时段。点日期标签整天填充，点时段表头整列填充。'
    : '选好画笔后按住拖动即可批量涂抹；轻点某天循环切换等级。'

  const cellStyle = (level: Level, isToday: boolean) => ({
    height: grid.cellH,
    borderRadius: grid.radius,
    background: levelFill(level),
    border: isToday ? '2px solid #ff6b35' : '1px solid rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background .12s ease',
    // 继承网格容器的 touch-action：编辑态下手指拖动不会触发页面纵向滚动
    touchAction: 'inherit',
  })

  const headStyle = (clickable: boolean, accent: boolean) => ({
    fontSize: grid.fSlot,
    lineHeight: 1.25,
    textAlign: 'center' as const,
    color: clickable && accent ? '#ff6b35' : '#9ca3af',
    fontWeight: clickable && accent ? 600 : 400,
    cursor: clickable ? 'pointer' : 'default',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'inherit',
  })

  return (
    <View>
      {!readOnly && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ display: 'block', fontSize: 12, color: '#9ca3af' }}>{hint}</Text>
          {granular && isTouch && (
            <View style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>手指拖动</Text>
              {[
                { on: paintOnDrag, label: '涂抹', v: true },
                { on: !paintOnDrag, label: '查看', v: false },
              ].map((o) => (
                <View
                  key={o.label}
                  onClick={() => setPaintOnDrag(o.v)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    background: o.on ? 'rgba(255,107,53,0.12)' : '#fff',
                    color: o.on ? '#ff6b35' : '#6b7280',
                    border: o.on ? '1.5px solid #ff6b35' : '1px solid rgba(0,0,0,0.08)',
                    fontWeight: o.on ? 600 : 400,
                  }}
                >
                  {o.label}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 涂抹容器：事件冒泡到这里统一处理 */}
      <View onMouseMove={onMouseMoveEv} onTouchMove={onTouchMoveEv} style={{ userSelect: 'none' }}>
        {granular ? (
          /* ── 精确到小时：日期 × 6 时段矩阵。能铺满就铺满，铺不下可横向拖动 ── */
          <View
            ref={boxRef}
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: 10,
              background: '#fff',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <View style={innerStyle}>
              <View style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: grid.gap, touchAction: gridTouch }}>
                {/* 表头 */}
                <View />
                <View onClick={() => !readOnly && fillDayColumn()} style={headStyle(!readOnly, false)}>
                  全天
                </View>
                {SLOTS.map((s) => {
                  const [st, en] = splitSlot(s)
                  return (
                    <View key={s} onClick={() => !readOnly && fillSlotColumn(s)} style={headStyle(!readOnly, true)}>
                      <Text style={{ fontSize: grid.fSlot, lineHeight: 1.25 }}>{st}</Text>
                      <Text style={{ fontSize: grid.fSlot, lineHeight: 1.25 }}>{en}</Text>
                    </View>
                  )
                })}

                {/* 每一天一行 */}
                {days.map((d) => {
                  const isToday = d === today
                  const dl = dayLevel(availability, d)
                  return (
                    <Fragment key={d}>
                      {/* 日期标签（吸顶在左侧，横向滚动时始终可见） */}
                      <View
                        onClick={() => !readOnly && fillWholeDay(d)}
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 2,
                          background: '#fff',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          cursor: readOnly ? 'default' : 'pointer',
                          WebkitTapHighlightColor: 'transparent',
                          touchAction: 'inherit',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: grid.fDate,
                            fontWeight: isToday ? 700 : 600,
                            color: isToday ? '#ff6b35' : '#374151',
                            lineHeight: 1.2,
                          }}
                        >
                          {shortDate(d)}
                        </Text>
                        <Text style={{ fontSize: grid.fWeekday, color: '#9ca3af', lineHeight: 1.2 }}>
                          {weekdayLabel(d)}
                        </Text>
                      </View>

                      {/* 全天格 */}
                      <View
                        data-cell={cellKey(d, null)}
                        style={cellStyle(dl, isToday)}
                        onMouseDown={handleCellDown(d, null)}
                        onTouchStart={handleCellTouchStart(d, null)}
                        onClick={handleCellClick(d, null)}
                      />

                      {/* 6 个时段格 */}
                      {SLOTS.map((s) => (
                        <View
                          key={`${d}-${s}`}
                          data-cell={cellKey(d, s)}
                          style={cellStyle(slotLevel(availability, d, s), isToday)}
                          onMouseDown={handleCellDown(d, s)}
                          onTouchStart={handleCellTouchStart(d, s)}
                          onClick={handleCellClick(d, s)}
                        />
                      ))}
                    </Fragment>
                  )
                })}
              </View>
            </View>
          </View>
        ) : (
          /* ── 按天：周日历网格（周一~周日 7 列，按自然月分组） ── */
          <View
            style={{
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: 10,
              background: '#fff',
              padding: 8,
            }}
          >
            <ScheduleMonthGrid
              days={days}
              today={today}
              editable={!readOnly}
              attrDataCell={!readOnly}
              touchAction={!readOnly ? 'none' : undefined}
              fillOf={(d) => {
                const lv = dayLevel(availability, d)
                return lv ? LEVEL_META[lv].fill : EMPTY_FILL
              }}
              textOf={(d) => {
                const lv = dayLevel(availability, d)
                return lv ? LEVEL_META[lv].text : '#374151'
              }}
              onDown={(d, e) => {
                if (readOnly || touchMode.current) return
                startAt(d, null, e)
              }}
              onTouchStart={(d, e) => {
                if (readOnly) return
                startAt(d, null, e)
              }}
              onClick={(d) => handleCellClick(d, null)()}
            />
          </View>
        )}
      </View>

      {/* 窄屏提示：横向可拖动（PC 端已铺满，不显示，免得误导） */}
      {granular && !isWide && (
        <Text style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#c4c4c4' }}>
          表格可左右拖动查看看不到的时段
        </Text>
      )}
    </View>
  )
}
