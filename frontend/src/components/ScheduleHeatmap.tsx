import { View, Text, ScrollView } from '@tarojs/components'
import {
  BUCKET_COLORS, BUCKET_LABELS, formatDateLabel, todayStr, recommendDay, runnerUpDays, DayRank,
} from '../utils/schedule'
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
  if (!merge) return null
  const days: string[] = merge.days || []
  const slots: string[] = merge.slots || []
  const granular = !!merge.granular_hours
  const cells = merge.cells || {}
  const today = todayStr()

  // 推荐日：只统计「有人作答」的日期；精确到小时时若「全天」列无人作答则按时段票数兜底。
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
        /* ── 精确到小时：日期 × 6 时段的横向矩阵 ── */
        <ScrollView
          scrollX
          style={{
            width: '100%', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10,
            background: '#fff', overflow: 'hidden',
          }}
        >
          <View style={{ display: 'inline-block', minWidth: '100%', padding: 8 }}>
            <View style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <View style={{ width: 72, flexShrink: 0 }} />
              <View style={{ width: 46, flexShrink: 0, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
                全天
              </View>
              {slots.map((s) => (
                <View key={s} style={{ minWidth: 46, textAlign: 'center', fontSize: 10, color: '#9ca3af', padding: '2px 0' }}>
                  {s}
                </View>
              ))}
            </View>

            {days.map((d) => {
              const isToday = d === today
              const dc = dayBucket(d)
              const isBest = best?.date === d
              return (
                <View key={d} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'stretch' }}>
                  <View
                    style={{
                      width: 72, flexShrink: 0, display: 'flex', alignItems: 'center',
                      fontSize: 12, color: isToday ? '#ff6b35' : '#2b2b2b',
                      fontWeight: isToday ? 700 : 500, paddingRight: 4,
                    }}
                  >
                    {formatDateLabel(d)}
                    {isBest ? <Text style={{ color: '#ff6b35', marginLeft: 2 }}>★</Text> : null}
                  </View>

                  {/* 全天格 */}
                  <View
                    onClick={() => onCellClick && onCellClick(d, null)}
                    style={{
                      minWidth: 46, height: 38, borderRadius: 8,
                      background: BUCKET_COLORS[dc],
                      border: isToday ? '2px solid #ff6b35' : '1px solid rgba(0,0,0,0.08)',
                      boxShadow: isBest ? '0 0 0 2px rgba(255,107,53,0.55)' : 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 10, color: bucketTextColor(dc) }}>{dayCounts(d).yes}</Text>
                  </View>

                  {/* 槽位格 */}
                  {slots.map((s) => {
                    const sc = cells[d]?.slots?.[s]?.bucket || 'white'
                    const yes = cells[d]?.slots?.[s]?.yes ?? 0
                    return (
                      <View
                        key={s}
                        onClick={() => onCellClick && onCellClick(d, s)}
                        style={{
                          minWidth: 46, height: 38, borderRadius: 8,
                          background: BUCKET_COLORS[sc],
                          border: '1px solid rgba(0,0,0,0.08)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 10, color: bucketTextColor(sc) }}>{yes}</Text>
                      </View>
                    )
                  })}
                </View>
              )
            })}
          </View>
        </ScrollView>
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
