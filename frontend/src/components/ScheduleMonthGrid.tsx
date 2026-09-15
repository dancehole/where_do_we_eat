import { View, Text } from '@tarojs/components'
import { dayNum, monthKey, monthLabel, weekdayIndex, WEEK_HEADER } from '../utils/schedule'

interface Props {
  /** 区间内的日期（YYYY-MM-DD，升序） */
  days: string[]
  today: string
  /** 单元格填充色 */
  fillOf: (date: string) => string
  /** 单元格文字色 */
  textOf: (date: string) => string
  /** 右下角小字（如热度图的「2/3」），返回 null 则不显示 */
  badgeOf?: (date: string) => string | null
  /** 可交互（编辑态）；只读态仅触发 onClick */
  editable?: boolean
  onDown?: (date: string, e?: any) => void
  onTouchStart?: (date: string, e?: any) => void
  onClick?: (date: string) => void
  /** 是否输出 data-cell 属性（供拖拽涂抹用 elementFromPoint 命中） */
  attrDataCell?: boolean
}

interface MonthBucket {
  key: string
  label: string
  /** 一个月内的格子序列，null 表示月末/月首的占位空格 */
  cells: (string | null)[]
}

/** 按自然月把连续日期切成「周日历」块：7 列（周一~周日），月首按星期补占位格 */
function buildMonths(days: string[]): MonthBucket[] {
  const months: MonthBucket[] = []
  for (const d of days) {
    const k = monthKey(d)
    let cur = months[months.length - 1]
    if (!cur || cur.key !== k) {
      cur = { key: k, label: monthLabel(d), cells: [] }
      // 该月首个日期落在周几，前面留空占位，保证列与表头对齐
      const lead = weekdayIndex(d)
      for (let i = 0; i < lead; i += 1) cur.cells.push(null)
      months.push(cur)
    }
    cur.cells.push(d)
  }
  return months
}

const CELL_WRAP = { width: '14.2857%', padding: '2px', boxSizing: 'border-box' as const }

/**
 * 周日历网格（月视图）：
 *  - 「精确到小时」时不用它（时段需要横向矩阵）
 *  - 「按天」时用它替代大竖排日期列表，空间利用率高很多
 *  - 编辑态（editable）与只读热度态（heatmap）共用同一套排布，只是颜色来源不同
 */
export default function ScheduleMonthGrid({
  days,
  today,
  fillOf,
  textOf,
  badgeOf,
  highlightOf,
  editable,
  onDown,
  onTouchStart,
  onClick,
  attrDataCell,
}: Props) {
  const months = buildMonths(days)

  return (
    <View>
      {months.map((mo) => (
        <View key={mo.key} style={{ marginBottom: 10 }}>
          <Text style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '2px 0 6px' }}>
            {mo.label}
          </Text>

          <View style={{ display: 'flex', flexWrap: 'wrap', userSelect: 'none' }}>
            {/* 星期表头 */}
            {WEEK_HEADER.map((w) => (
              <View key={`h-${w}`} style={CELL_WRAP}>
                <Text style={{ display: 'block', textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '2px 0' }}>
                  {w}
                </Text>
              </View>
            ))}

            {/* 日期格 */}
            {mo.cells.map((d, i) => {
              if (!d) return <View key={`b-${mo.key}-${i}`} style={CELL_WRAP} />

              const isToday = d === today
              const badge = badgeOf ? badgeOf(d) : null
              const hot = highlightOf ? highlightOf(d) : false
              return (
                <View key={d} style={CELL_WRAP}>
                  <View
                    {...(attrDataCell ? { 'data-cell': `${d}__day` } : {})}
                    onMouseDown={editable && onDown ? (e: any) => onDown(d, e) : undefined}
                    onTouchStart={editable && onTouchStart ? (e: any) => onTouchStart(d, e) : undefined}
                    onClick={onClick ? () => onClick(d) : undefined}
                    style={{
                      position: 'relative',
                      height: 44,
                      borderRadius: 8,
                      background: fillOf(d),
                      border: isToday ? '2px solid #ff6b35' : '1px solid rgba(0,0,0,0.07)',
                      boxShadow: hot ? '0 0 0 2px rgba(255,107,53,0.6)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      userSelect: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'background .12s ease',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isToday ? 700 : 600, color: textOf(d), lineHeight: 1.1 }}>
                      {dayNum(d)}
                    </Text>
                    {badge ? (
                      <Text style={{ fontSize: 10, color: textOf(d), opacity: 0.85, lineHeight: 1.2 }}>{badge}</Text>
                    ) : null}
                    {hot ? (
                      <Text
                        style={{
                          position: 'absolute', top: -6, right: -3, fontSize: 12, lineHeight: 1,
                          color: '#ff6b35',
                        }}
                      >
                        ★
                      </Text>
                    ) : null}
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}
