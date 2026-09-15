import Taro from '@tarojs/taro'
import { getApiBase } from '../config'

/**
 * 匿名用户身份（免登录）。
 *
 * 设计：
 * - 用 Taro 持久化存储（H5 即 localStorage，等价于 cookie 的持久化语义；小程序即 wx storage）。
 * - 每个浏览器/设备生成一个稳定匿名 id，作为跨碰面识别「同一个参与者」的依据。
 * - 昵称默认「匿名用户xx」（xx=两位随机数），用户可改；改后持久化，下次自动带入。
 * - 微信小程序：提供 fetchWechatProfile() 通过 getUserProfile 拉取「昵称 + 头像」（需用户点击触发）；
 *   weappLogin() 通过 wx.login 换 openid 作为更稳定的微信身份（wechat_id）。
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

/** 是否微信小程序环境（用构建期常量判断：Taro.getEnv() 返回的是 'WEAPP' 大写） */
export function isWeapp(): boolean {
  return process.env.TARO_ENV === 'weapp'
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

export interface WechatProfile {
  /** 微信昵称 */
  nickname: string
  /** 微信头像 URL（getUserProfile 返回，可能带有效期；小程序内 <Image> 展示） */
  avatarUrl: string
}

/**
 * 微信小程序：一次性获取「昵称 + 头像」（getUserProfile 同时返回二者）。
 * - 需由用户点击事件触发（微信强制要求用户手势）。
 * - 返回 { nickname, avatarUrl }，或 null（用户拒绝 / 非小程序环境）。
 * 配合 weappLogin() 拿到的 openid，即可在小程序里以「微信身份」命名参与者。
 */
export async function fetchWechatProfile(): Promise<WechatProfile | null> {
  if (!isWeapp()) return null
  try {
    const res: any = await Taro.getUserProfile({ desc: '用于在碰面中显示你的昵称和头像' })
    const u = res?.userInfo
    if (u?.nickName) {
      return { nickname: u.nickName, avatarUrl: u.avatarUrl || '' }
    }
  } catch {
    // 用户拒绝授权或环境不支持：静默返回 null，UI 回退到手动输入
  }
  return null
}

const WECHAT_OPENID_KEY = 'wechat_openid'

/**
 * 微信小程序登录：wx.login() 拿 code → 后端 code2session 换 openid（匿名身份）。
 * - 仅小程序环境调用；未配置 WECHAT_APPID/SECRET 时后端返回 ok:False，这里静默回退到设备匿名身份。
 * - openid 持久化到 storage，作为更稳定的微信身份（与 device_id 并行，不破坏现有逻辑）。
 */
export async function weappLogin(): Promise<string | null> {
  if (!isWeapp()) return null
  try {
    const res: any = await Taro.login()
    const code = res?.code
    if (!code) return null
    const r: any = await Taro.request({
      url: `${getApiBase()}/api/auth/wechat?code=${code}`,
      method: 'GET',
    })
    const d = r.data || {}
    if (d.ok && d.openid) {
      Taro.setStorageSync(WECHAT_OPENID_KEY, d.openid)
      return d.openid
    }
  } catch {
    // 网络/后端异常：忽略，继续使用设备匿名身份
  }
  return null
}

/** 已持久化的微信 openid（可能为空） */
export function getWechatOpenid(): string {
  return Taro.getStorageSync(WECHAT_OPENID_KEY) || ''
}
