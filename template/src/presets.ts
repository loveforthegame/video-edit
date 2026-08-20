import type { CSSProperties } from 'react';

export type Preset = {
  name: string;
  font: string;
  ink: string;      // primary text on cards
  accent: string;   // brand/action color
  accent2: string;  // secondary accent (gradients, sparkles)
  danger: string;   // badges, alerts
  onAccent: string; // text on accent-filled surfaces
  radius: number;
  card: (extra?: CSSProperties) => CSSProperties;
};

const base = (p: Omit<Preset, 'card'>, surface: CSSProperties) =>
  (extra: CSSProperties = {}): CSSProperties => ({
    borderRadius: p.radius,
    fontFamily: p.font,
    color: p.ink,
    ...surface,
    ...extra,
  });

const build = (p: Omit<Preset, 'card'>, surface: CSSProperties): Preset => ({
  ...p,
  card: base(p, surface),
});

/** Frosted glassmorphism over bright footage. The default. */
export const glass = (accent = '#17A94E', accent2 = '#46E065') =>
  build(
    {
      name: 'glass',
      font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      ink: '#0C2418',
      accent,
      accent2,
      danger: '#E8503A',
      onAccent: '#fff',
      radius: 28,
    },
    {
      background: 'linear-gradient(135deg, rgba(255,255,255,0.50), rgba(255,255,255,0.20))',
      backdropFilter: 'blur(22px) saturate(1.5)',
      WebkitBackdropFilter: 'blur(22px) saturate(1.5)',
      border: '1.5px solid rgba(255,255,255,0.70)',
      boxShadow: '0 24px 60px rgba(10,30,20,0.20), inset 0 1px 0 rgba(255,255,255,0.8)',
    },
  );

/** Dark translucent HUD with neon edges. For tech/gaming/product footage. */
export const darkHud = (accent = '#39E6FF', accent2 = '#7CFF6B') =>
  build(
    {
      name: 'dark-hud',
      font: "'Bahnschrift', 'Segoe UI', Arial, sans-serif",
      ink: '#EAF8FF',
      accent,
      accent2,
      danger: '#FF5470',
      onAccent: '#04121A',
      radius: 14,
    },
    {
      background: 'linear-gradient(135deg, rgba(8,16,24,0.72), rgba(8,16,24,0.5))',
      backdropFilter: 'blur(18px) saturate(1.2)',
      WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
      border: `1px solid ${accent}55`,
      boxShadow: `0 0 26px ${accent}33, 0 18px 50px rgba(0,0,0,0.45)`,
    },
  );

/** Solid white cards, thick outlines, hard offset shadows. Loud UGC energy. */
export const neoBrutal = (accent = '#FF4D2E', accent2 = '#FFD400') =>
  build(
    {
      name: 'neo-brutal',
      font: "'Arial Black', 'Segoe UI Black', sans-serif",
      ink: '#111111',
      accent,
      accent2,
      danger: '#FF4D2E',
      onAccent: '#fff',
      radius: 10,
      },
    {
      background: '#FFFFFF',
      border: '3.5px solid #111111',
      boxShadow: '10px 10px 0 #111111',
    },
  );

/** Near-opaque white, hairline border, soft shadow. Premium/fashion. */
export const minimal = (accent = '#C8963C', accent2 = '#E8B84B') =>
  build(
    {
      name: 'minimal',
      font: "'Georgia', 'Times New Roman', serif",
      ink: '#191510',
      accent,
      accent2,
      danger: '#B4452F',
      onAccent: '#fff',
      radius: 20,
    },
    {
      background: 'rgba(255,255,255,0.93)',
      border: '1px solid rgba(25,21,16,0.14)',
      boxShadow: '0 18px 50px rgba(25,21,16,0.16)',
    },
  );

export const PRESETS = { glass, darkHud, neoBrutal, minimal };
