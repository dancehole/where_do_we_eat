/**
 * 排期网格的手势状态机（纯逻辑，不碰 DOM，可直接单测）
 *
 * 背景 —— 移动端一次「轻点」实际会连发这一串事件：
 *   touchstart → touchend → mousedown → mouseup → click
 *
 * 历史上因此出过两个 bug：
 *   ① touch 与 mouse 两套处理都会跑一遍 → 一次轻点把格子推进两格
 *      （表现就是「颜色随机跳」：绿 → 黄 → 白）；
 *   ② 拖动后抬手的位置会补发一次 click，若恰好落在画笔调色板上 → 画笔被改掉。
 *
 * 本状态机把「轻点」与「拖动」严格互斥，并给出「需要吞掉紧随其后 click」的时间窗，
 * 由调用方在 document 捕获阶段拦掉那一次 click。合成鼠标事件由调用方的
 * TOUCH_MOUSE_GUARD_MS 窗口另行屏蔽（见 ScheduleGridEditor）。
 */

/** 位移超过该距离（曼哈顿距离）才算「拖动」，否则视为「轻点」 */
export const MOVE_THRESHOLD = 6
/** 拖动结束后需要吞掉 click 的时间窗 */
export const CLICK_SUPPRESS_MS = 400
/** 触摸后屏蔽合成鼠标事件的时间窗 */
export const TOUCH_MOUSE_GUARD_MS = 700

export interface MoveResult {
  /**
   * 本次需要涂抹的格子 key 列表（可能为空）。
   * 首次检测到拖动时会**先包含起点格** —— 否则手指快速滑动时起点那一格会被跳过涂不到。
   */
  paints: string[]
  /** 是否已进入「拖动」状态 */
  moved: boolean
}

export type CellResolver = (x: number, y: number) => string | null

export class ScheduleGesture {
  private active = false
  private moved = false
  private painted = false
  private sx = 0
  private sy = 0
  private startCell = ''
  private lastKey = ''
  private suppressUntil = 0

  /** 按下（鼠标 mousedown / 触摸 touchstart）：只记起点，绝不写入 —— 写入交给 click 或拖动 */
  begin(x: number, y: number, startCell = '') {
    this.active = true
    this.moved = false
    this.painted = false
    this.lastKey = ''
    this.sx = x
    this.sy = y
    this.startCell = startCell
  }

  /**
   * 移动。
   * @param allowPaint false = 只记录「拖动过」，不做涂抹（查看模式，把拖动让给浏览器滚动）
   * @param resolve    由坐标解析格子 key（H5 用 document.elementFromPoint）。
   *                   ⚠️ 解析不到（手指滑出网格）必须返回 null，不能退回起点格，
   *                   否则滑出网格后会一直涂起点那一格。
   */
  move(x: number, y: number, allowPaint: boolean, resolve: CellResolver): MoveResult {
    if (!this.active) return { paints: [], moved: this.moved }
    if (!this.moved && Math.abs(x - this.sx) + Math.abs(y - this.sy) > MOVE_THRESHOLD) {
      this.moved = true
    }
    if (!this.moved) return { paints: [], moved: false }
    if (!allowPaint) return { paints: [], moved: true }

    const resolved = resolve(x, y) || null
    const out: string[] = []
    // 首次涂抹时补上起点格（快速滑动不会丢掉「按下的那一格」）
    if (!this.painted && this.startCell && this.startCell !== resolved && this.startCell !== this.lastKey) {
      out.push(this.startCell)
    }
    if (resolved && resolved !== this.lastKey && !out.includes(resolved)) out.push(resolved)
    if (!out.length) return { paints: [], moved: true }

    this.lastKey = out[out.length - 1]
    this.painted = true
    return { paints: out, moved: true }
  }

  /** 抬手/取消（touchend / mouseup / touchcancel）。返回是否已开启 click 屏蔽窗 */
  end(now: number): boolean {
    if (!this.active) return false
    this.active = false
    if (this.moved) {
      this.suppressUntil = now + CLICK_SUPPRESS_MS
      return true
    }
    return false
  }

  /** 该 click 是否应被吞掉；吞掉后立即失效（每次拖动只吞一次） */
  consumeSuppressedClick(now: number): boolean {
    if (this.suppressUntil && now < this.suppressUntil) {
      this.suppressUntil = 0
      return true
    }
    return false
  }

  /** 本次手势是否发生了实际涂抹（用于调试/断言） */
  get didPaint(): boolean {
    return this.painted
  }

  /** 起点格（首次涂抹时会被补上） */
  get startCellKey(): string {
    return this.startCell
  }

  get isDragging(): boolean {
    return this.active && this.moved
  }
}
