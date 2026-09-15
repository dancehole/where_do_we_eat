import { useEffect, useRef } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import {
  Level, SLOTS, LEVEL_META, levelFill, dayLevel, slotLevel,
  setDayLevel, setSlotLevel, cycleLevel, formatDateLabel, todayStr, EMPTY_FILL,
} from '../utils/schedule'
import ScheduleMonthGrid from './ScheduleMonthGrid'

interface Props {
  availability: any
  days: string[]
  granular: boolean
  /** 当前画笔等级（受控，由父级 AvailabilityBrush 共享） */
  brush: Level
  onBrushChange?: (lv: Level) => void
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

export default function ScheduleGridEditor({
  availability,
  days,
  granular,
  brush,
  readOnly,
  onChange,
  onCellClick,
}: Props) {
  const painting = useRef(false)
  const painted = useRef(false)
  const startRef = useRef<{ date: string; slot: string | null }>({ date: '', slot: null })
  const lastKey = useRef<string>('')

  const today = todayStr()

  // ── 写入：套用画笔 / 单击循环 ────────────────────────────────────────────────
  // ⚠️ 这里曾经有个致命 bug：setDayLevel 的签名是 (av, date, level)，
  //    却按 setSlotLevel 的 (av, date, slot, level) 传了 4 个参数，
  //    导致 level 实际拿到的是 slot=null → 「全天」列永远只会写成「未作答」，
  //    表现就是「全天那一列点不动 / 涂抹没反应」。按天模式下唯一可点的就是全天列，
  //    所以会表现为整页都点不动。
  const applyBrush = (date: string, slot: string | null) => {
    if (!onChange) return
    const next = slot
      ? setSlotLevel(availability, date, slot, brush)
      : setDayLevel(availability, date, brush)
    onChange(next)
  }
  const cycle = (date: string, slot: string | null) => {
    if (!onChange) return
    const cur = slot ? slotLevel(availability, date, slot) : dayLevel(availability, date)
    const next = cycleLevel(cur)
    const nv = slot
      ? setSlotLevel(availability, date, slot, next)
      : setDayLevel(availability, date, next)
    onChange(nv)
  }
  // 整行/整列快捷：用当前画笔填充
  const fillDay = (date: string) => applyBrush(date, null)
  const fillSlot = (slot: string) => {
    if (!onChange) return
    let nv = availability || {}
    for (const d of days) nv = setSlotLevel(nv, d, slot, brush)
    onChange(nv)
  }

  // ── 拖拽涂抹（H5：mousedown/move + elementFromPoint；移动端 touch 同理） ──
  const begin = (date: string, slot: string | null) => {
    painting.current = true
    painted.current = false
    lastKey.current = ''
    startRef.current = { date, slot }
  }
  const paintAt = (x: number, y: number) => {
    if (!painting.current || !onChange) return
    const key = cellAtPoint(x, y)
    if (!key || key === lastKey.current) return
    lastKey.current = key
    const [date, slotRaw] = key.split('__')
    const slot = slotRaw === 'day' ? null : slotRaw
    applyBrush(date, slot)
    painted.current = true
  }
  const end = () => {
    // 没有发生涂抹 = 一次单击 → 循环该格（单格微调）
    if (painting.current && !painted.current && onChange) {
      cycle(startRef.current.date, startRef.current.slot)
    }
    painting.current = false
  }
  const endRef = useRef(end)
  endRef.current = end

  // 鼠标/手指在网格外抬起也要结束涂抹（否则会「粘住」持续涂抹）
  useEffect(() => {
    if (readOnly || typeof document === 'undefined') return
    const up = () => endRef.current()
    document.addEventListener('mouseup', up)
    document.addEventListener('touchend', up)
    document.addEventListener('touchcancel', up)
    return () => {
      document.removeEventListener('mouseup', up)
      document.removeEventListener('touchend', up)
      document.removeEventListener('touchcancel', up)
    }
  }, [readOnly])

  const handleCellDown = (date: string, slot: string | null) => (e: any) => {
    if (readOnly) return
    e?.stopPropagation?.()
    begin(date, slot)
  }
  const handleCellTouch = (date: string, slot: string | null) => (e: any) => {
    if (readOnly) return
    e?.stopPropagation?.()
    const tt = e?.touches?.[0]
    begin(date, slot)
    if (tt) paintAt(tt.clientX, tt.clientY)
  }

  const cellStyle = (level: Level, isToday: boolean, minWidth: number) => ({
    position: 'relative' as const,
    minWidth,
    height: 38,
    borderRadius: 8,
    background: levelFill(level),
    border: isToday ? '2px solid #ff6b35' : '1px solid rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background .12s ease',
  })

  const hint = granular
    ? '按住拖动可批量涂抹；单击格子循环 未答 → 有空 → 可能有空 → 可能没空 → 没空。点「全天」列表头/日期标签可整列或整日填充，点时段表头可整列填充（「全天」与 6 个时段是两套独立作答，填其中一套即可）。'
    : '按住拖动可批量涂抹；单击某天循环 未答 → 有空 → 可能有空 → 可能没空 → 没空。'

  const onMove = (e: any) => {
    if (readOnly) return
    paintAt(e.clientX, e.clientY)
  }
  const onTouchMove = (e: any) => {
    if (readOnly) return
    const tt = e?.touches?.[0]
    if (tt) paintAt(tt.clientX, tt.clientY)
  }

  return (
    <View>
      {/* 使用提示（仅编辑态） */}
      {!readOnly && (
        <Text style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{hint}</Text>
      )}

      {/* 拖拽涂抹的容器：事件冒泡到这里统一处理 */}
      <View onMouseMove={onMove} onTouchMove={onTouchMove} style={{ userSelect: 'none' }}>
        {granular ? (
          /* ── 精确到小时：横向矩阵（日期 × 6 个时段） ── */
          <ScrollView
            scrollX
            style={{
              width: '100%',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: 10,
              background: '#fff',
              overflow: 'hidden',
            }}
          >
            <View style={{ display: 'inline-block', minWidth: '100%', padding: 8 }}>
              {/* 表头 */}
              <View style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <View style={{ width: 72, flexShrink: 0 }} />
                <View style={{ width: 46, flexShrink: 0, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
                  全天
                </View>
                {SLOTS.map((s) => (
                  <View
                    key={s}
                    onClick={() => !readOnly && fillSlot(s)}
                    style={{
                      minWidth: 46,
                      textAlign: 'center',
                      fontSize: 10,
                      color: readOnly ? '#9ca3af' : '#ff6b35',
                      fontWeight: readOnly ? 400 : 600,
                      cursor: readOnly ? 'default' : 'pointer',
                      padding: '2px 0',
                    }}
                  >
                    {s}
                  </View>
                ))}
              </View>

              {/* 每一天一行 */}
              {days.map((d) => {
                const isToday = d === today
                const dl = dayLevel(availability, d)
                return (
                  <View key={d} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'stretch' }}>
                    <View
                      onClick={() => !readOnly && fillDay(d)}
                      style={{
                        width: 72, flexShrink: 0, display: 'flex', alignItems: 'center',
                        fontSize: 12, color: isToday ? '#ff6b35' : '#2b2b2b',
                        fontWeight: isToday ? 700 : 500,
                        cursor: readOnly ? 'default' : 'pointer', paddingRight: 4,
                      }}
                    >
                      {formatDateLabel(d)}
                    </View>

                    {/* 全天（day）格 */}
                    <View
                      data-cell={cellKey(d, null)}
                      style={cellStyle(dl, isToday, 46)}
                      onClick={() => readOnly && onCellClick && onCellClick(d, null)}
                      onMouseDown={handleCellDown(d, null)}
                      onTouchStart={handleCellTouch(d, null)}
                    />

                    {/* 精确到小时的 6 个槽位 */}
                    {SLOTS.map((s) => {
                      const sl = slotLevel(availability, d, s)
                      return (
                        <View
                          key={s}
                          data-cell={cellKey(d, s)}
                          style={cellStyle(sl, isToday, 46)}
                          onClick={() => readOnly && onCellClick && onCellClick(d, s)}
                          onMouseDown={handleCellDown(d, s)}
                          onTouchStart={handleCellTouch(d, s)}
                        />
                      )
                    })}
                  </View>
                )
              })}
            </View>
          </ScrollView>
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
              fillOf={(d) => {
                const lv = dayLevel(availability, d)
                return lv ? LEVEL_META[lv].fill : EMPTY_FILL
              }}
              textOf={(d) => {
                const lv = dayLevel(availability, d)
                return lv ? LEVEL_META[lv].text : '#374151'
              }}
              onDown={(d) => begin(d, null)}
              onTouchStart={(d) => begin(d, null)}
              onClick={(d) => readOnly && onCellClick && onCellClick(d, null)}
            />
          </View>
        )}
      </View>
    </View>
  )
}
