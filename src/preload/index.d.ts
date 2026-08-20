import { ElectronAPI } from '@electron-toolkit/preload'
import type { MainAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: MainAPI
  }
}
