import { useEffect, useRef, useState } from 'react'

/* ── 排期网格的响应式尺寸（编辑器 / 只读合并热度图共用，避免两处漂移） ──────────
 *
 * 手机（视口 < WIDE_BP）：列宽 `minmax(34px, 1fr)` 自适应铺满，塞不下就横向拖动；
 *   格子 34×34、字号 10/9 —— 这套手感已定稿，不要动。
 *
 * PC（视口 ≥ WIDE_BP）：列宽 `minmax(0, 1fr)` 自适应，但**单格宽度封顶 CELL_W_PC_MAX=100px**
 *   （超宽屏不再把格子拉得过大：封顶后网格窄于容器，靠 innerStyle 的 margin:auto 居中）；
 *   格子高度按实际列宽以 CELL_RATIO_PC（≈16:9）反推并 clamp，字号跟着放大。
 *
 * 用法：`const { boxRef, grid } = useGridMetrics(cols, granular)`，
 *   boxRef 挂到「带 overflow-x 的滚动容器」上，grid 提供模板/高度/字号。
 */

export const WIDE_BP = 600
export const GAP_MOBILE = 4
export const GAP_DESKTOP = 6
export const LABEL_W_MOBILE = 46
export const LABEL_W_DESKTOP = 60
export const CELL_MIN = 34
/** PC 单格最大宽度：超过就不再撑大（网格会窄于父容器并居中），避免超宽屏格子过大 */
export const CELL_W_PC_MAX = 100
export const CELL_H_MOBILE = 34
export const CELL_H_PC_MIN = 40
export const CELL_H_PC_MAX = 78
/** PC 格子目标「宽 / 高」：16:9≈1.78，取 1.7 略方正一点 */
export const CELL_RATIO_PC = 1.7
/**
 * 网格内容（含左右各 8px 内边距）的最大宽度。
 * 页面自身已限宽（`useResponsive`：tablet 720 / desktop 1080），desktop 下网格可用宽度
 * 约 956px，所以这里取 1000 —— 永远不先于页面触顶，等价于「PC 端总是铺满父容器」；
 * 仅当组件被放到更宽的容器里时才起保护作用（避免格子被拉成扁条）。
 */
export const CONTENT_MAX_W = 1000
/** 网格容器左右内边距 */
export const GRID_PAD = 8

export interface GridMetrics {
  isWide: boolean
  gap: number
  labelW: number
  /** 实际列宽（PC 由容器宽反推，用于算高度与字号；手机恒为 CELL_MIN） */
  cellW: number
  cellH: number
  radius: number
  fDate: number
  fWeekday: number
  fSlot: number
  fCount: number
  template: string
  /** 手机端内容最小宽度（窄于此就横向滚动）；PC 为 0 */
  minWidth: number
  contentMaxW: number
  /** 是否「铺满父容器」而没有触到内容上限 */
  fill: boolean
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** 是否宽屏（PC / 平板）。小程序端恒为 false（走手机档） */
export function detectWide(): boolean {
  if (process.env.TARO_ENV !== 'h5') return false
  if (typeof window === 'undefined') return false
  return window.innerWidth >= WIDE_BP
}

/**
 * @param isWide 是否宽屏
 * @param cols   格子列数（**不含**左侧日期标签列）
 * @param boxW   滚动容器实测宽度（0 = 还没量到，用视口估算）
 */
export function computeMetrics(isWide: boolean, cols: number, boxW: number): GridMetrics {
  const gap = isWide ? GAP_DESKTOP : GAP_MOBILE
  const labelW = isWide ? LABEL_W_DESKTOP : LABEL_W_MOBILE
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const guessW = isWide ? Math.max(720, vw - 72) : 360

  // PC 内容宽度上限：既受 CONTENT_MAX_W 保护，也受「单格最大 100px」约束
  // （单格封顶后网格不再铺满父容器，靠 innerStyle 的 margin:auto 居中）。
  const capByCell = labelW + cols * CELL_W_PC_MAX + gap * cols + GRID_PAD * 2
  const contentMaxW = isWide ? Math.min(CONTENT_MAX_W, capByCell) : CONTENT_MAX_W
  const maxAvail = contentMaxW - GRID_PAD * 2
  const avail = Math.min((boxW > 0 ? boxW : guessW) - GRID_PAD * 2, maxAvail)

  // PC：列宽由容器反推（列本身是 1fr，这里只用来算高度和字号），并封顶 100px
  const cellW = isWide
    ? clamp(Math.floor((avail - labelW - gap * cols) / cols), CELL_MIN, CELL_W_PC_MAX)
    : CELL_MIN
  const cellH = isWide
    ? Math.round(clamp(cellW / CELL_RATIO_PC, CELL_H_PC_MIN, CELL_H_PC_MAX))
    : CELL_H_MOBILE

  return {
    isWide,
    gap,
    labelW,
    cellW,
    cellH,
    radius: isWide ? Math.round(clamp(cellH * 0.16, 8, 12)) : 7,
    fDate: isWide ? Math.round(clamp(cellH * 0.19, 11, 15)) : 10,
    fWeekday: isWide ? Math.round(clamp(cellH * 0.15, 9, 12)) : 9,
    fSlot: isWide ? Math.round(clamp(cellH * 0.16, 10, 12)) : 9,
    fCount: isWide ? Math.round(clamp(cellH * 0.18, 10, 14)) : 10,
    template: isWide
      ? `${labelW}px repeat(${cols}, minmax(0, 1fr))`
      : `${labelW}px repeat(${cols}, minmax(${CELL_MIN}px, 1fr))`,
    minWidth: isWide ? 0 : labelW + cols * CELL_MIN + cols * gap + GRID_PAD * 2,
    contentMaxW,
    /** 是否「铺满父容器」而没有触到单格上限 */
    fill: isWide && cellW < CELL_W_PC_MAX,
  }
}

/**
 * 量出网格容器宽度并判断是否宽屏。
 * @param cols     格子列数
 * @param reattach 变化时重新绑定量测（如 granular 切换导致容器重新挂载）
 */
export function useGridMetrics(cols: number, reattach?: any) {
  const boxRef = useRef<any>(null)
  const [boxW, setBoxW] = useState(0)
  const [isWide, setIsWide] = useState<boolean>(detectWide)

  useEffect(() => {
    if (process.env.TARO_ENV !== 'h5' || typeof window === 'undefined') return
    const read = () => {
      const el: any = boxRef.current
      const w = el && (el.getBoundingClientRect ? el.getBoundingClientRect().width : el.clientWidth)
      setIsWide(window.innerWidth >= WIDE_BP)
      if (w) setBoxW((prev) => (Math.abs(prev - w) > 1 ? Math.round(w) : prev))
    }
    read()
    const el: any = boxRef.current
    let ro: any = null
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(read)
      ro.observe(el)
    }
    window.addEventListener('resize', read)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', read)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reattach])

  return { boxRef, grid: computeMetrics(isWide, cols, boxW) }
}
