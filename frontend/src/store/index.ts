import { create } from 'zustand'
import Taro from '@tarojs/taro'

function getDeviceId(): string {
  let id = Taro.getStorageSync('device_id')
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    Taro.setStorageSync('device_id', id)
  }
  return id
}

interface State {
  deviceId: string
  meetupCode: string | null
  /** 最近一次操作的碰面码，用于底部“吃饭”分类一键带入餐厅列表 */
  lastCode: string | null
  setMeetupCode: (c: string) => void
  setLastCode: (c: string) => void
}

export const useStore = create<State>((set) => ({
  deviceId: getDeviceId(),
  meetupCode: null,
  lastCode: null,
  setMeetupCode: (c) => set({ meetupCode: c, lastCode: c }),
  setLastCode: (c) => set({ lastCode: c }),
}))
