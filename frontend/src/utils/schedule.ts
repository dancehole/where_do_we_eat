// 排期相关常量与日期工具（不依赖外部库）

// 精确到小时时的 6 个固定 2 小时槽位
export const SLOTS = [
  '09:00-11:00',
  '11:00-13:00',
  '13:00-15:00',
  '15:00-17:00',
  '17:00-19:00',
  '19:00-21:00',
]

// 4 个可选等级 + 未作答（null）= 第 5 态
export type Level = 'yes' | 'maybe' | 'maybe_not' | 'no' | null

export const LEVELS: Exclude<Level, null>[] = ['yes', 'maybe', 'maybe_not', 'no']

// 单击单元格的循环顺序
export const CYCLE: Level[] = [null, 'yes', 'maybe', 'maybe_not', 'no']

export function cycleLevel(cur: Level): Level {
  const i = CYCLE.indexOf(cur)
  return CYCLE[(i + 1) % CYCLE.length]
}

// 等级 → 文案 / 填充色 / 文字色
export const LEVEL_META: Record<
  Exclude<Level, null>,
  { label: string; short: string; fill: string; text: string }
> = {
  yes: { label: '应该有空', short: '有空', fill: '#22c55e', text: '#06340f' },
  maybe: { label: '可能有空，待确认', short: '可能有空', fill: '#a3e635', text: '#1a3300' },
  maybe_not: { label: '可能没空，待确认', short: '可能没空', fill: '#facc15', text: '#3d2f00' },
  no: { label: '一定没空', short: '没空', fill: '#ef4444', text: '#3a0606' },
}

// 未作答（第 5 态）填充色
export const EMPTY_FILL = '#f3f4f6'

export function levelFill(level: Level): string {
  return level ? LEVEL_META[level].fill : EMPTY_FILL
}

// 合并热度 5 档 → 颜色
export const BUCKET_COLORS: Record<string, string> = {
  dark_green: '#15803d',
  light_green: '#86efac',
  white: '#ffffff',
  light_red: '#fca5a5',
  dark_red: '#b91c1c',
}

export const BUCKET_LABELS: Record<string, string> = {
  dark_green: '大家都一定有空',
  light_green: '大部分有空',
  white: '大部分不确定',
  light_red: '大部分没空',
  dark_red: '大家都没空',
}

// ── 日期工具（用 UTC 计算，规避夏令时/时区漂移） ──────────────────────────────
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function fmtDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = []
  let cur = parseDate(start).getTime()
  const last = parseDate(end).getTime()
  while (cur <= last) {
    out.push(fmtDate(new Date(cur)))
    cur += 86400000
  }
  return out
}

export function formatDateLabel(s: string): string {
  const d = parseDate(s)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}-${dd} ${WEEK[d.getUTCDay()]}`
}

// ── 窄屏横向矩阵用的紧凑标签（省宽度） ─────────────────────────────────────────
/** '09-15'（去掉年份，窄屏左侧行标签用） */
export function shortDate(s: string): string {
  return s.slice(5)
}

/** '周二'（窄屏左侧行标签第二行用） */
export function weekdayLabel(s: string): string {
  return WEEK[parseDate(s).getUTCDay()]
}

/** 把 '09:00-11:00' 拆成 ['09:00', '11:00']，供窄列表头两行显示 */
export function splitSlot(s: string): [string, string] {
  const i = s.indexOf('-')
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]
}

// ── 周日历（月视图）用的辅助 ───────────────────────────────────────────────────
/** 周日历表头（周一到周日） */
export const WEEK_HEADER = ['一', '二', '三', '四', '五', '六', '日']

/** ISO 星期序号：周一=0 … 周日=6（用于把日期摆到周日历的正确列上） */
export function weekdayIndex(s: string): number {
  return (parseDate(s).getUTCDay() + 6) % 7
}

/** 当月第几天（1-31），日历格子里的数字 */
export function dayNum(s: string): number {
  return parseDate(s).getUTCDate()
}

/** 'YYYY-MM'，用于按自然月分组 */
export function monthKey(s: string): string {
  return s.slice(0, 7)
}

/** '2026年9月' */
export function monthLabel(s: string): string {
  const d = parseDate(s)
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`
}

// 今天（本地）YYYY-MM-DD，用于网格中高亮「今天」
export function todayStr(): string {
  const n = new Date()
  return fmtDate(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())))
}

// availability 单格读取
export function dayLevel(av: any, date: string): Level {
  const e = av?.[date]
  return e && typeof e === 'object' ? (e.day ?? null) : null
}

export function slotLevel(av: any, date: string, slot: string): Level {
  const e = av?.[date]
  const slots = e && typeof e === 'object' ? e.slots : null
  return slots && typeof slots === 'object' ? (slots[slot] ?? null) : null
}

// 统计「待确认」格数（maybe / maybe_not），用于应用内提醒
export function countPending(av: any): number {
  let n = 0
  if (!av || typeof av !== 'object') return 0
  for (const date of Object.keys(av)) {
    const e = av[date]
    if (!e || typeof e !== 'object') continue
    if (e.day === 'maybe' || e.day === 'maybe_not') n += 1
    const slots = e.slots
    if (slots && typeof slots === 'object') {
      for (const lv of Object.values(slots)) {
        if (lv === 'maybe' || lv === 'maybe_not') n += 1
      }
    }
  }
  return n
}

// 持久化「我在此排期中的参与者 id」（复用 meetup 的 joinKey 思路）
export const scheduleJoinKey = (code: string) => `eat_sched_join_${code}`

// 构造 availability 单格设置（不可变更新）
export function setDayLevel(av: any, date: string, level: Level): any {
  const next = { ...(av || {}) }
  const cur = next[date] && typeof next[date] === 'object' ? { ...next[date] } : {}
  cur.day = level
  next[date] = cur
  return next
}

export function setSlotLevel(av: any, date: string, slot: string, level: Level): any {
  const next = { ...(av || {}) }
  const cur = next[date] && typeof next[date] === 'object' ? { ...next[date] } : {}
  const slots = cur.slots && typeof cur.slots === 'object' ? { ...cur.slots } : {}
  slots[slot] = level
  cur.slots = slots
  next[date] = cur
  return next
}

// ── 推荐日（「什么时候聚」） ───────────────────────────────────────────────────
export interface DayRank {
  date: string
  yes: number
  maybe: number
  maybe_not: number
  no: number
  /** 该日总票数（含所有等级） */
  answered: number
  /** 打分：有空×2 + 可能有空×1 － 可能没空×1 － 没空×2 */
  score: number
}

/**
 * 给区间内每一天打分并排序（只保留「至少有一人作答」的日期）。
 * ⚠️ 关键点：**无人作答的日期直接排除**，否则分数 0 会挤掉真正有人有空的日期
 *    （旧版 bug：09-15 无人作答却因为 0 > -1 被推荐成「0 人有空」）。
 * 精确到小时时，若「全天」列没人作答，则退化为统计该日 6 个时段的票数。
 */
export function rankDays(merge: any): DayRank[] {
  const days: string[] = merge?.days || []
  const cells = merge?.cells || {}
  const granular = !!merge?.granular_hours
  const slots: string[] = merge?.slots || []
  const out: DayRank[] = []

  for (const d of days) {
    const c = cells[d]
    if (!c) continue
    let yes = c.day?.yes ?? 0
    let maybe = c.day?.maybe ?? 0
    let maybeNot = c.day?.maybe_not ?? 0
    let no = c.day?.no ?? 0
    let answered = yes + maybe + maybeNot + no

    // 「全天」列无人作答时，用当天各时段票数兜底（避免精确到小时的排期算不出推荐日）
    if (granular && answered === 0) {
      for (const s of slots) {
        const sc = c.slots?.[s]
        if (!sc) continue
        yes += sc.yes ?? 0
        maybe += sc.maybe ?? 0
        maybeNot += sc.maybe_not ?? 0
        no += sc.no ?? 0
      }
      answered = yes + maybe + maybeNot + no
    }
    if (answered === 0) continue

    out.push({ date: d, yes, maybe, maybe_not: maybeNot, no, answered, score: yes * 2 + maybe - maybeNot - no * 2 })
  }
  return out
}

/** 推荐日排序：分数高优先 → 有空人数多优先 → 日期早优先 */
function byRank(a: DayRank, b: DayRank): number {
  return b.score - a.score || b.yes - a.yes || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
}

/** 最推荐的日期（需要「至少一人有空/可能有空」）；否则返回 null */
export function recommendDay(merge: any): DayRank | null {
  const cands = rankDays(merge).filter((r) => r.yes + r.maybe > 0)
  if (!cands.length) return null
  cands.sort(byRank)
  return cands[0]
}

/** 仅次于推荐日的备选（最多 n 个） */
export function runnerUpDays(merge: any, n = 2): DayRank[] {
  const cands = rankDays(merge).filter((r) => r.yes + r.maybe > 0)
  if (cands.length <= 1) return []
  cands.sort(byRank)
  return cands.slice(1, 1 + n)
}

/**
 * 合并热度分档（与后端 `_bucket` 保持一致，便于前端解释）：
 *   ① 无人作答 → white
 *   ② 全员「一定有空」→ dark_green；全员「一定没空」→ dark_red
 *   ③ 只有「待确认」票（既无 yes 又无 no）→ white
 *   ④ 其余按加权占比：pos = yes + maybe×0.5，neg = no + maybe_not×0.5
 *      pos 多 → light_green；neg 多 → light_red；打平 → white
 */
export const BUCKET_RULE = [
  '① 无人作答 → 白色（不确定）',
  '② 全员「一定有空」→ 深绿；全员「一定没空」→ 深红',
  '③ 只有「待确认」票 → 白色（不确定）',
  '④ 其余按加权比较：正面票 = 有空 + 可能有空×0.5，负面票 = 没空 + 可能没空×0.5',
  '　　· 正面票多 → 浅绿（大部分有空）',
  '　　· 负面票多 → 浅红（大部分没空）',
  '　　· 打平 → 白色（分歧，需协商）',
]
