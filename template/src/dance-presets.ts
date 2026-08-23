/**
 * Looks for music mode.
 *
 * `presets.ts` styles overlay *cards* for narration-driven ads. A dance edit is
 * mostly about what happens to the footage itself, so a look carries grade,
 * punch, shake, trail and flash settings instead of card surfaces. The two are
 * independent: a music edit can use a `DanceLook` for the footage and a `Preset`
 * for any card it happens to put on top.
 */

export type TrailSpec = {
  /** how many echo layers (each one is another video decode — keep it low) */
  count: number;
  /** frames between echoes */
  gap: number;
  /** opacity of the first echo; later ones fall off */
  opacity: number;
  blend: 'screen' | 'lighten' | 'normal' | 'difference';
};

export type DanceLook = {
  name: string;
  font: string;
  ink: string;
  accent: string;
  accent2: string;
  /** CSS filter applied to the footage — the colour grade */
  grade: string;
  /** extra zoom at the peak of a kick, e.g. 0.06 = 6% punch in */
  punch: number;
  /** frames for the punch to fall away; smaller is snappier */
  punchDecay: number;
  /** camera shake in px at full intensity */
  shake: number;
  /** rotation wobble in degrees at full intensity */
  wobble: number;
  /** peak opacity of the on-beat flash */
  flash: number;
  flashColor: string;
  trail: TrailSpec;
  /** 0 disables the noise overlay; it is the most expensive effect here */
  grain: number;
  /** 0..1 darkening at the edges */
  vignette: number;
  /** px of chromatic offset when RGBSplit is used */
  split: number;
};

const base = {
  ink: '#FFFFFF',
  font: "'Arial Black', 'Segoe UI Black', Impact, sans-serif",
};

/** Loud, punchy, high-contrast. The default for dance and hype edits. */
export const hype = (accent = '#FF2D6F', accent2 = '#FFD400'): DanceLook => ({
  ...base,
  name: 'hype',
  accent,
  accent2,
  grade: 'saturate(1.25) contrast(1.12) brightness(1.02)',
  punch: 0.065,
  punchDecay: 4,
  shake: 9,
  wobble: 0.5,
  flash: 0.3,
  flashColor: '#FFFFFF',
  trail: { count: 2, gap: 3, opacity: 0.34, blend: 'screen' },
  grain: 0,
  vignette: 0.22,
  split: 7,
});

/** Club/neon: cool shadows, glowing trails, heavier chromatic split. */
export const neon = (accent = '#22E1FF', accent2 = '#B36BFF'): DanceLook => ({
  ...base,
  name: 'neon',
  font: "'Bahnschrift', 'Segoe UI', Arial, sans-serif",
  accent,
  accent2,
  grade: 'saturate(1.4) contrast(1.18) hue-rotate(-6deg) brightness(0.98)',
  punch: 0.05,
  punchDecay: 5,
  shake: 6,
  wobble: 0.35,
  flash: 0.26,
  flashColor: accent,
  trail: { count: 3, gap: 4, opacity: 0.4, blend: 'screen' },
  grain: 0,
  vignette: 0.34,
  split: 10,
});

/** Filmic: soft contrast, grain, restrained motion. For choreography pieces. */
export const film = (accent = '#E8D9B5', accent2 = '#C89B5A'): DanceLook => ({
  ...base,
  name: 'film',
  font: "'Georgia', 'Times New Roman', serif",
  ink: '#F6F1E7',
  accent,
  accent2,
  grade: 'saturate(0.88) contrast(1.06) sepia(0.08) brightness(1.01)',
  punch: 0.03,
  punchDecay: 8,
  shake: 3,
  wobble: 0.2,
  flash: 0.12,
  flashColor: '#FFF6E2',
  trail: { count: 0, gap: 4, opacity: 0, blend: 'normal' },
  grain: 0.16,
  vignette: 0.4,
  split: 3,
});

/** Almost no grade, tight punch, no trails. Lets the choreography carry it. */
export const clean = (accent = '#FFFFFF', accent2 = '#9AA6B2'): DanceLook => ({
  ...base,
  name: 'clean',
  font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  accent,
  accent2,
  grade: 'saturate(1.05) contrast(1.04)',
  punch: 0.035,
  punchDecay: 5,
  shake: 4,
  wobble: 0,
  flash: 0.14,
  flashColor: '#FFFFFF',
  trail: { count: 0, gap: 3, opacity: 0, blend: 'normal' },
  grain: 0,
  vignette: 0.12,
  split: 4,
});

export const DANCE_LOOKS = { hype, neon, film, clean };
