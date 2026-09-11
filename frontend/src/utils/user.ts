import Taro from '@tarojs/taro'

/**
 * 匿名用户身份（免登录）。
 *
 * 设计：
 * - 用 Taro 持久化存储（H5 即 localStorage，等价于 cookie 的持久化语义；小程序即 wx storage）。
 * - 每个浏览器/设备生成一个稳定匿名 id，作为跨碰面识别「同一个参与者」的依据。
 * - 昵称默认「匿名用户xx」（xx=两位随机数），用户可改；改后持久化，下次自动带入。
 * - 微信小程序：提供 fetchWechatNickname() 通过 getUserProfile 拉取用户昵称（需用户点击触发）。
 */

const ANON_ID_KEY = 'eat_anon_id'
const NICK_KEY = 'eat_nick'

function rand2(): string {
  // 10~99 两位随机数，作为「匿名用户」后缀
  return String(Math.floor(Math.random() * 90) + 10)
}

/** 稳定匿名 id（每个浏览器/设备唯一），持久保存 */
export function getAnonId(): string {
  let id = Taro.getStorageSync(ANON_ID_KEY)
  if (!id) {
    id = 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
    Taro.setStorageSync(ANON_ID_KEY, id)
  }
  return id
}

/** 已保存的昵称（可能为空） */
export function getStoredNickname(): string {
  return Taro.getStorageSync(NICK_KEY) || ''
}

/** 默认昵称：已保存则用保存的，否则「匿名用户xx」 */
export function getDefaultNickname(): string {
  const n = getStoredNickname()
  if (n) return n
  return '匿名用户' + rand2()
}

/** 持久化昵称 */
export function saveNickname(name: string) {
  if (name && name.trim()) Taro.setStorageSync(NICK_KEY, name.trim())
}

/** 是否微信小程序环境 */
export function isWeapp(): boolean {
  return Taro.getEnv() === 'weapp'
}

/**
 * 微信小程序：获取用户昵称（需由用户点击事件触发）。
 * 返回昵称字符串，或 null（用户拒绝 / 非小程序环境）。
 * 注意：getUserProfile 仅返回昵称与头像，不含 openid；本应用匿名，id 仍用 getAnonId()。
 */
export async function fetchWechatNickname(): Promise<string | null> {
  if (!isWeapp()) return null
  try {
    const res: any = await Taro.getUserProfile({ desc: '用于在碰面中显示你的昵称' })
    const nick = res?.userInfo?.nickName
    if (nick) return nick
  } catch {
    // 用户拒绝授权或环境不支持：静默返回 null，UI 回退到手动输入
  }
  return null
}
