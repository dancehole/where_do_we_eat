import Taro from '@tarojs/taro'
import { getApiBase } from '../config'
import { useStore } from '../store'

async function request(path: string, options: { method?: string; data?: any } = {}) {
  const deviceId = useStore.getState().deviceId
  // 每次请求都解析一次：H5 下取当前页面主机名，内网/局域网访问时自动指向同一台机器的 8000 端口
  const base = getApiBase()
  let res: any
  try {
    res = await Taro.request({
      url: `${base}${path}`,
      method: (options.method || 'GET') as any,
      data: options.data,
      header: { 'content-type': 'application/json', 'X-Device-Id': deviceId },
    })
  } catch (e: any) {
    // 网络层失败（连接被拒 / 超时 / 域名不合法等）：Taro 把原因放在 errMsg，e.message 往往为空
    const detail = e?.errMsg || e?.message || String(e)
    throw new Error(`网络请求失败（${base}）：${detail}`)
  }
  if (res.statusCode >= 400) {
    // 后端是 FastAPI：错误体形如 { detail: "..." }；尽量取出可读原因而不是整段 JSON
    const d: any = res.data
    const detail =
      d?.detail ??
      d?.message ??
      (typeof d === 'string' ? d : d ? JSON.stringify(d) : '无响应体')
    throw new Error(`HTTP ${res.statusCode}：${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
  return res.data
}

function buildQuery(params: Record<string, any>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return q ? `?${q}` : ''
}

export const api = {
  createMeetup: (body: any) => request('/api/meetups', { method: 'POST', data: body }),
  getMeetup: (code: string) => request(`/api/meetups/${code}`),
  joinMeetup: (code: string, body: any) =>
    request(`/api/meetups/${code}/join`, { method: 'POST', data: body }),
  updateParticipant: (code: string, pid: string, body: any) =>
    request(`/api/meetups/${code}/participants/${pid}`, { method: 'PATCH', data: body }),
  addLocation: (code: string, body: any) =>
    request(`/api/meetups/${code}/add-location`, { method: 'POST', data: body }),
  endMeetup: (code: string) => request(`/api/meetups/${code}/end`, { method: 'POST' }),
  setMeetupRule: (code: string, rule: string) =>
    request(`/api/meetups/${code}/rule`, { method: 'PATCH', data: { rule } }),
  listMine: (status?: string) =>
    request(`/api/meetups${status ? `?status=${status}` : ''}`),
  history: () => request('/api/meetups/history/list'),
  center: (code: string) => request(`/api/meetups/${code}/center`),
  restaurants: (code: string, params: Record<string, any> = {}) =>
    request(`/api/meetups/${code}/restaurants${buildQuery(params)}`),
  // 碰面专属偏好（保留）
  preferences: (code: string, body: any) =>
    request(`/api/meetups/${code}/preferences`, { method: 'POST', data: body }),

  // 全局偏好（跨碰面复用，设置页用）
  myPreferences: () => request('/api/preferences'),
  savePreferences: (body: any) => request('/api/preferences', { method: 'PUT', data: body }),
  parsePreferences: (text: string) =>
    request('/api/preferences/parse', { method: 'POST', data: { text } }),

  aiRecommend: (body: any) => request('/api/ai/recommend', { method: 'POST', data: body }),

  // ── 排期（多人约时间） ──
  createSchedule: (body: any) => request('/api/schedules', { method: 'POST', data: body }),
  getSchedule: (code: string, pid?: string) =>
    request(`/api/schedules/${code}${pid ? `?pid=${encodeURIComponent(pid)}` : ''}`),
  updateSchedule: (code: string, body: any) =>
    request(`/api/schedules/${code}`, { method: 'PATCH', data: body }),
  joinSchedule: (code: string, body: any) =>
    request(`/api/schedules/${code}/join`, { method: 'POST', data: body }),
  saveAvailability: (code: string, participantId: string, availability: any) =>
    request(`/api/schedules/${code}/availability`, {
      method: 'PUT',
      data: { participant_id: participantId, availability },
    }),
  mergeSchedule: (code: string) => request(`/api/schedules/${code}/merge`),
  closeSchedule: (code: string) => request(`/api/schedules/${code}/close`, { method: 'POST' }),
  openSchedule: (code: string) => request(`/api/schedules/${code}/open`, { method: 'POST' }),
  listMySchedules: () => request('/api/schedules/mine'),
}
