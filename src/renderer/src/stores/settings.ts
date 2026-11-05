import { create } from 'zustand';

export interface LayoutSettings {
  sidebarWidth: number;
  /** Fraction of the main column used by the request pane (0.15–0.85). */
  requestFraction: number;
}

interface SettingsState extends LayoutSettings {
  setSidebarWidth(px: number): void;
  setRequestFraction(f: number): void;
  load(layout: Partial<LayoutSettings>): void;
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const useSettings = create<SettingsState>((set) => ({
  sidebarWidth: 260,
  requestFraction: 0.45,
  setSidebarWidth: (px) => set({ sidebarWidth: clamp(Math.round(px), 180, 600) }),
  setRequestFraction: (f) => set({ requestFraction: clamp(f, 0.15, 0.85) }),
  load: (layout) =>
    set((s) => ({
      sidebarWidth: clamp(layout.sidebarWidth ?? s.sidebarWidth, 180, 600),
      requestFraction: clamp(layout.requestFraction ?? s.requestFraction, 0.15, 0.85),
    })),
}));
