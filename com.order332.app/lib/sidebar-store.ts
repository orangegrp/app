import { create } from 'zustand'

interface SidebarStore {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  toggle: () => void
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  collapsed: false,
  setCollapsed: (collapsed) => set({ collapsed }),
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}))
