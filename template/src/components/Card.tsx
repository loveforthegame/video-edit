import { interpolate, useCurrentFrame } from 'remotion';
import type { Preset } from '../presets';

/** Preset-aware surface. Pass position/size via style. */
export const Card: React.FC<{
  p: Preset;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ p, style, children }) => (
  <div style={p.card(style)}>{children}</div>
);

/** Diagonal shine sweep across a rounded parent. Skip for neo-brutal. */
export const Shine: React.FC<{ start: number; dur?: number; radius?: number }> = ({
  start,
  dur = 45,
  radius = 28,
}) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [start, start + dur], [-40, 140], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: '-30%',
          bottom: '-30%',
          left: `${x}%`,
          width: '26%',
          transform: 'rotate(18deg)',
          background:
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.75) 50%, rgba(255,255,255,0) 100%)',
        }}
      />
    </div>
  );
};

export const fadeOut = (frame: number, start: number, dur = 20) =>
  interpolate(frame, [start, start + dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Gentle idle bob so cards never feel frozen. */
export const floatY = (frame: number, seed: number, amp = 6) => Math.sin((frame + seed * 37) / 42) * amp;
