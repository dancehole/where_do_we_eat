import { Fragment } from 'react'
import { View, Text } from '@tarojs/components'
import {
  BUCKET_COLORS, BUCKET_LABELS, formatDateLabel, todayStr, recommendDay, runnerUpDays, DayRank,
  shortDate, weekdayLabel, splitSlot,
} from '../utils/schedule'
import { useGridMetrics, GRID_PAD } from '../utils/scheduleLayout'
import ScheduleMonthGrid from './ScheduleMonthGrid'

interface Props {
  merge: any
  onCellClick?: (date: string, slot: string | null) => void
}

/** 深色档位（深绿/深红）用白字，浅色档位用深字，保证对比度 */
function bucketTextColor(bucket: string): string {
  return bucket === 'dark_green' || bucket === 'dark_red' ? '#ffffff' : '#374151'
}

export default function ScheduleHeatmap({ merge, onCellClick }: Props) {
  const days: string[] = (merge && merge.days) || []
  const slots: string[] = (merge && merge.slots) || []
  const granular = !!(merge && merge.granular_hours)
  const cells = (merge && merge.cells) || {}
  const today = todayStr()

  // ⚠️ 尺寸 hook 必须在 `if (!merge) return null` 之前调用，否则 hooks 顺序会变。
  // 精细到小时：格列数 = 6 时段（已无「全天」列）。按天模式用周日历，不进这里。
  const heatCols = slots.length
  const { boxRef, grid } = useGridMetrics(heatCols, granular)

  if (!merge) return null

  /** 网格列模板：手机自适应铺满 + 塞不下横向拖；PC 用 1fr 铺满父容器 */
  const TEMPLATE = grid.template
  /** 网格内芯：PC 宽度 100%（上限 CONTENT_MAX_W，超宽屏才居中）；手机给 minWidth 保证可横滚 */
  const innerStyle = grid.isWide
    ? {
        display: 'block', padding: GRID_PAD, width: '100%', maxWidth: grid.contentMaxW,
        margin: '0 auto', boxSizing: 'border-box' as const,
      }
    : { display: 'block', padding: GRID_PAD, minWidth: grid.minWidth, boxSizing: 'border-box' as const }

  // 推荐日：只统计「有人作答」的日期；精确到小时时按当天各时段票数汇总（已无「全天」列）。
  // 旧版算法用 `score = yes*2 - no`、初值 -1，导致无人作答的日期（分数 0）胜出，
  // 才会出现「推荐 09-15，但 0 人有空」这种结果。
  const best: DayRank | null = recommendDay(merge)
  const runners = runnerUpDays(merge, 2)

  const dayBucket = (d: string) => cells[d]?.day?.bucket || 'white'
  const dayCounts = (d: string) => cells[d]?.day || { yes: 0, maybe: 0, maybe_not: 0, no: 0 }

  return (
    <View>
      {best ? (
        <View
          style={{
            marginBottom: 10, padding: '10px 12px',
            background: 'rgba(21,128,61,0.10)', border: '1px solid rgba(21,128,61,0.25)',
            borderRadius: 10,
          }}
        >
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 13, color: '#15803d', fontWeight: 700 }}>
              推荐：{formatDateLabel(best.date)}
            </Text>
            <Text style={{ fontSize: 12, color: '#15803d' }}>
              （{best.yes} 人一定有空{best.maybe > 0 ? ` · ${best.maybe} 人可能有空` : ''} · 共 {best.answered} 人作答）
            </Text>
          </View>
          {runners.length > 0 && (
            <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>备选</Text>
              {runners.map((r) => (
                <Text
                  key={r.date}
                  onClick={() => onCellClick && onCellClick(r.date, null)}
                  style={{
                    fontSize: 11, color: '#4b5563', cursor: 'pointer',
                    padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.75)',
                    border: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  {formatDateLabel(r.date)} · {r.yes} 人有空
                </Text>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View
          style={{
            marginBottom: 10, padding: '10px 12px',
            background: 'rgba(107,114,128,0.08)', border: '1px solid rgba(107,114,128,0.18)',
            borderRadius: 10,
          }}
        >
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            还没有人勾选时间，暂时算不出推荐日期。
          </Text>
        </View>
      )}

      {granular ? (
        /* ── 精确到小时：日期 × 6 时段矩阵（能铺满就铺满，塞不下可横向拖动） ── */
        <View
          ref={boxRef}
          style={{
            display: 'block', width: '100%', boxSizing: 'border-box',
            border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10,
            background: '#fff', overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}
        >
          <View style={innerStyle}>
            <View
              style={{
                display: 'grid',
                gridTemplateColumns: TEMPLATE,
                gap: grid.gap,
              }}
            >
              {/* 表头 */}
              <View />
              {slots.map((s) => {
                const [st, en] = splitSlot(s)
                return (
                  <View
                    key={s}
                    style={{
                      textAlign: 'center', color: '#9ca3af',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: grid.fSlot, lineHeight: 1.25 }}>{st}</Text>
                    <Text style={{ fontSize: grid.fSlot, lineHeight: 1.25 }}>{en}</Text>
                  </View>
                )
              })}

              {days.map((d) => {
                const isToday = d === today
                const isBest = best?.date === d
                return (
                  <Fragment key={d}>
                    {/* 日期标签（吸顶） */}
                    <View
                      style={{
                        position: 'sticky', left: 0, zIndex: 2, background: '#fff',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: grid.fDate, fontWeight: isToday ? 700 : 600,
                          color: isToday ? '#ff6b35' : '#374151', lineHeight: 1.2,
                        }}
                      >
                        {shortDate(d)}
                        {isBest ? '★' : ''}
                      </Text>
                      <Text style={{ fontSize: grid.fWeekday, color: '#9ca3af', lineHeight: 1.2 }}>
                        {weekdayLabel(d)}
                      </Text>
                    </View>

                    {/* 时段格 */}
                    {slots.map((s) => {
                      const sc = cells[d]?.slots?.[s]?.bucket || 'white'
                      const yes = cells[d]?.slots?.[s]?.yes ?? 0
                      return (
                        <View
                          key={`${d}-${s}`}
                          onClick={() => onCellClick && onCellClick(d, s)}
                          style={{
                            height: grid.cellH, borderRadius: grid.radius,
                            background: BUCKET_COLORS[sc],
                            border: '1px solid rgba(0,0,0,0.08)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: grid.fCount, color: bucketTextColor(sc) }}>{yes}</Text>
                        </View>
                      )
                    })}
                  </Fragment>
                )
              })}
            </View>
          </View>
        </View>
      ) : (
        /* ── 按天：周日历热度图 ── */
        <View style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, background: '#fff', padding: 8 }}>
          <ScheduleMonthGrid
            days={days}
            today={today}
            badgeOf={(d) => {
              const c = dayCounts(d)
              const answered = c.yes + c.maybe + c.maybe_not + c.no
              return answered > 0 ? `${c.yes}/${answered}` : null
            }}
            highlightOf={(d) => best?.date === d}
            fillOf={(d) => BUCKET_COLORS[dayBucket(d)]}
            textOf={(d) => bucketTextColor(dayBucket(d))}
            onClick={(d) => onCellClick && onCellClick(d, null)}
          />
        </View>
      )}

      {/* 图例 */}
      <View style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        {Object.entries(BUCKET_COLORS).map(([b, c]) => (
          <View key={b} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 14, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.12)' }} />
            <Text style={{ fontSize: 11, color: '#6b6b6b' }}>{BUCKET_LABELS[b]}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
