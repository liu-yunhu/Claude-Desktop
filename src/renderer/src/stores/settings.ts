import { create } from 'zustand'
import type { AppSettings } from '@shared/types'

const DEFAULTS: AppSettings = {
  theme: 'dark',
  defaultWorkDir: 'D:\\CodeProject\\Claude-Desktop',
  defaultModel: '',
  defaultEffort: '',
  defaultPermissionMode: 'acceptEdits',
  closeToTray: true,
  lastOpenedDirs: []
}

interface SettingsState extends AppSettings {
  loaded: boolean
  load: () => Promise<void>
  save: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    const stored = (await window.api.config.readAppSettings()) as Partial<AppSettings>
    set({ ...DEFAULTS, ...stored, loaded: true })
    void window.api.system.setCloseToTray(stored.closeToTray ?? true)
  },

  save: async (patch) => {
    const next = { ...get(), ...patch }
    set(patch)
    const { loaded, load, save, ...persist } = next
    void loaded
    void load
    void save
    await window.api.config.writeAppSettings(persist)
    if (patch.closeToTray !== undefined) {
      void window.api.system.setCloseToTray(patch.closeToTray)
    }
  }
}))
