import { View, Text } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import ScheduleHeatmap from '../../components/ScheduleHeatmap'
import ScheduleCellDetail from '../../components/ScheduleCellDetail'
import { BUCKET_RULE } from '../../utils/schedule'

export default function ScheduleMerge() {
  const router = useRouter()
  const code = router.params.code || ''
  const [merge, setMerge] = useState<any>(null)
  const [detail, setDetail] = useState<any>(null)
  const [drill, setDrill] = useState<{ date: string; slot: string | null } | null>(null)

  useEffect(() => {
    ;(async () => {
      try { setMerge(await api.mergeSchedule(code)) } catch { setMerge(null) }
      try { setDetail(await api.getSchedule(code)) } catch { setDetail(null) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCell = (date: string, slot: string | null) => setDrill({ date, slot })

  return (
    <PageContainer
      title='合并排期'
      subtitle={detail ? `${detail.title} · ${detail.participant_count} 人` : '大家有空的时间'}
      icon='target'
      tab='schedule'
      back
      crumb={['排期', code, '合并']}
    >
      <Section title='热度日历' icon='target' tone='green'>
        <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 10 }}>
          颜色越绿代表大家越有空，越红代表越没空。点某天/某时段可查看每个人的选择；
          {merge?.granular_hours ? '带数字的格子里，数字是「一定有空」的人数。' : '格子里的 a/b 表示「a 人一定有空 / 共 b 人作答」。'}
        </Text>
        {merge ? (
          <ScheduleHeatmap merge={merge} onCellClick={openCell} />
        ) : (
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>加载中...</Text>
        )}
      </Section>

      {/* 算法透明化：把「颜色怎么来的 / 推荐日怎么算的」直接写清楚，避免猜 */}
      <Section title='颜色是怎么算的？' icon='rule' tone='neutral' collapsible defaultOpen={false}>
        <Text style={{ display: 'block', fontSize: 12, color: '#4b5563', marginBottom: 8 }}>
          每一格把「所有人对该格的作答」按 5 个等级统计后归入 5 档颜色：
        </Text>
        <View style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {BUCKET_RULE.map((line) => (
            <Text key={line} style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.7 }}>{line}</Text>
          ))}
        </View>
        <Text style={{ display: 'block', fontSize: 12, color: '#4b5563', marginBottom: 6 }}>
          「待确认」的两个等级（可能有空 / 可能没空）按「半票」计入正面 / 负面：可能有大空算 0.5 票正面，
          可能没空算 0.5 票负面。所以只要有人勾了「待确认」，就会把颜色往对应方向拉一点，不会立刻变成深绿或深红。
        </Text>
        <Text style={{ display: 'block', fontSize: 12, color: '#4b5563' }}>
          推荐日：先排除「没有任何人作答」的日期，再按「一定有空×2 + 可能有空×1 － 可能没空×1 － 一定没空×2」打分取最高；
          分数相同时，先比「一定有空」的人数，再比日期先后。精确到小时的排期里，每天直接按当天 6 个时段的票数汇总，不再有独立的「全天」列。
        </Text>
      </Section>

      <ScheduleCellDetail
        visible={!!drill}
        date={drill?.date || ''}
        slot={drill?.slot ?? null}
        merge={merge}
        onClose={() => setDrill(null)}
      />
    </PageContainer>
  )
}
