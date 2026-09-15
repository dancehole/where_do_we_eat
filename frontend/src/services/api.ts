import Taro from '@tarojs/taro'
import { getApiBase } from '../config'
import { useStore } from '../store'

async function request(path: string, options: { method?: string; data?: any } = {}) {
  const deviceId = useStore.getState().deviceId
  // 每次请求都解析一次：H5 下取当前页面主机名，内网/局域网访问时自动指向同一台机器的 8000 端口
  const base = getApiBase()
  const res = await Taro.request({
    url: `${base}${path}`,
    method: (options.method || 'GET') as any,
    data: options.data,
    header: { 'content-type': 'application/json', 'X-Device-Id': deviceId },
  })
  if (res.statusCode >= 400) {
    throw new Error(JSON.stringify(res.data))
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
}
