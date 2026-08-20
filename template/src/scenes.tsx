// Reusable overlay scene primitives. Each one is prop-driven (texts, timings)
// and preset-aware (pass a Preset from presets.ts). Compose them in Timeline.tsx
// inside <Sequence> blocks; every scene animates from its LOCAL frame 0.
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { Preset } from './presets';
import { Shine, fadeOut, floatY } from './components/Card';
import {
  BellIcon,
  CheckDraw,
  CursorIcon,
  LogoMark,
  MailIcon,
  MiniMock,
  Sparkle,
  Toggle,
  TypingDots,
} from './components/Icons';
import { DigitRoll } from './lib/DigitRoll';
import { dampedSettle, velocityAt } from './lib/helpers/motion';

const useIn = (delay: number, damping = 13) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 130 }, durationInFrames: 40 });
};

// ---------- NotificationStack: cascading "message" cards + unread counter ----------
export type Notification = { name: string; when: string; text: string; x: number; y: number; r: number; d: number };

export const NotificationStack: React.FC<{
  p: Preset;
  dur: number;
  items: Notification[];
  counter?: { value: string; label: string; top?: number };
}> = ({ p, dur, items, counter }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = interpolate(frame, [dur - 26, dur - 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      {items.map((m, i) => {
        const s = spring({ frame: frame - m.d, fps, config: { damping: 12, stiffness: 140 }, durationInFrames: 40 });
        const shakeT = frame - m.d - 60;
        const shake = dampedSettle(shakeT > 0 ? shakeT % 90 : 0, 0.25, 0.2) * 2.2;
        return (
          <div
            key={i}
            style={p.card({
              position: 'absolute',
              left: m.x,
              top: m.y + floatY(frame, i),
              width: 640,
              padding: '26px 30px',
              transform: `translateX(${(1 - s) * -700 + exit * 900}px) rotate(${m.r + shake}deg) scale(${0.85 + s * 0.15})`,
              opacity: s * (1 - exit),
              display: 'flex',
              alignItems: 'center',
              gap: 22,
            })}
          >
            <div style={{ position: 'relative' }}>
              <MailIcon color={p.ink} />
              <div style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: 10, background: p.danger, border: '2.5px solid #fff' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 27, fontWeight: 800 }}>
                {m.name} <span style={{ fontWeight: 500, opacity: 0.55, fontSize: 23 }}>• {m.when}</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 600, opacity: 0.85 }}>{m.text}</div>
            </div>
          </div>
        );
      })}
      {counter &&
        (() => {
          const s = spring({ frame: frame - 100, fps, config: { damping: 11 }, durationInFrames: 38 });
          const wig = dampedSettle(frame - 108, 0.22, 0.13) * 14;
          return (
            <div
              style={p.card({
                position: 'absolute',
                right: 64,
                top: (counter.top ?? 96) + floatY(frame, 9),
                padding: '20px 30px',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                transform: `scale(${s})`,
                opacity: s * (1 - exit),
              })}
            >
              <BellIcon color={p.ink} wiggle={wig} />
              <span style={{ fontSize: 34, fontWeight: 800, display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
                <DigitRoll value={counter.value} delay={104} fontSize={34} color={p.danger} />
                <span style={{ color: p.danger }}>{counter.label}</span>
              </span>
            </div>
          );
        })()}
    </AbsoluteFill>
  );
};

// ---------- BrandCard: logo + name + tagline with shine ----------
export const BrandCard: React.FC<{
  p: Preset;
  dur: number;
  name: React.ReactNode;
  tagline?: string;
  logo?: React.ReactNode;
  top?: number;
}> = ({ p, dur, name, tagline, logo, top = 210 }) => {
  const frame = useCurrentFrame();
  const s = useIn(4, 12);
  const out = fadeOut(frame, dur - 22);
  return (
    <AbsoluteFill>
      <div
        style={p.card({
          position: 'absolute',
          left: 120,
          right: 120,
          top: top + floatY(frame, 3, 5),
          padding: '42px 40px',
          display: 'flex',
          alignItems: 'center',
          gap: 30,
          justifyContent: 'center',
          transform: `scale(${0.7 + s * 0.3}) translateY(${(1 - s) * 60}px)`,
          opacity: s * out,
        })}
      >
        {logo ?? <LogoMark color={p.accent} />}
        <div>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>{name}</div>
          {tagline && <div style={{ fontSize: 28, fontWeight: 600, opacity: 0.65 }}>{tagline}</div>}
        </div>
        {p.name !== 'neo-brutal' && <Shine start={26} radius={p.radius} />}
      </div>
    </AbsoluteFill>
  );
};

// ---------- SideToggleCard: labeled switch + optional pill ----------
export const SideToggleCard: React.FC<{
  p: Preset;
  dur: number;
  label: string;
  pill?: string;
  flipAt?: number;
  top?: number;
}> = ({ p, dur, label, pill, flipAt = 44, top = 150 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useIn(4, 13);
  const flip = spring({ frame: frame - flipAt, fps, config: { damping: 13 }, durationInFrames: 30 });
  const pillS = spring({ frame: frame - flipAt - 32, fps, config: { damping: 12 }, durationInFrames: 36 });
  const out = fadeOut(frame, dur - 22);
  return (
    <AbsoluteFill>
      <div
        style={p.card({
          position: 'absolute',
          right: 70,
          top: top + floatY(frame, 5),
          padding: '30px 36px',
          display: 'flex',
          alignItems: 'center',
          gap: 26,
          transform: `translateX(${(1 - s) * 500}px)`,
          opacity: s * out,
        })}
      >
        <Toggle on={flip} accent={p.accent} accent2={p.accent2} />
        <div style={{ fontSize: 36, fontWeight: 800 }}>{label}</div>
      </div>
      {pill && (
        <div
          style={p.card({
            position: 'absolute',
            right: 70,
            top: top + 142 + floatY(frame, 6),
            padding: '18px 32px',
            borderRadius: 999,
            transform: `scale(${pillS})`,
            opacity: pillS * out,
            fontSize: 28,
            fontWeight: 700,
          })}
        >
          ✓ {pill}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- TaskAutomation: task card, checkbox tick, flying envelope, toast, typing chip ----------
export const TaskAutomation: React.FC<{
  p: Preset;
  dur: number;
  kicker: string;
  title: string;
  tag: string;
  toastTitle: string;
  toastSub: string;
  typingLabel?: string;
  tickAt?: number;
  flyAt?: number;
  toastAt?: number;
  typingAt?: number;
}> = ({ p, dur, kicker, title, tag, toastTitle, toastSub, typingLabel, tickAt = 50, flyAt = 158, toastAt = 250, typingAt = 330 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useIn(4, 13);
  const tick = interpolate(frame, [tickAt, tickAt + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const out = fadeOut(frame, dur - 22);

  const F_DUR = 86;
  const posAt = (f: number) => {
    const t = Math.min(1, Math.max(0, (f - flyAt) / F_DUR));
    const x = interpolate(t, [0, 1], [330, 1220], { easing: Easing.bezier(0.4, 0, 0.9, 0.6) });
    const y = 330 - Math.sin(t * Math.PI) * 190 + t * 60;
    return { x, y };
  };
  const pos = posAt(frame);
  const v = velocityAt(posAt, frame);
  const flying = frame >= flyAt && frame <= flyAt + F_DUR;

  const toast = spring({ frame: frame - toastAt, fps, config: { damping: 12, stiffness: 150 }, durationInFrames: 40 });
  const typing = spring({ frame: frame - typingAt, fps, config: { damping: 12 }, durationInFrames: 36 });

  return (
    <AbsoluteFill>
      <div
        style={p.card({
          position: 'absolute',
          left: 64,
          top: 130 + floatY(frame, 2),
          width: 620,
          padding: '30px 34px',
          transform: `translateY(${(1 - s) * -260}px)`,
          opacity: s * out,
        })}
      >
        <div style={{ fontSize: 24, fontWeight: 700, opacity: 0.55, letterSpacing: 2 }}>{kicker}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: `3.5px solid ${tick > 0 ? p.accent : 'rgba(0,0,0,0.35)'}`,
              background: tick > 0.9 ? `${p.accent2}44` : 'rgba(255,255,255,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckDraw size={38} progress={tick} color={p.accent} />
          </div>
          <div style={{ fontSize: 38, fontWeight: 800 }}>{title}</div>
        </div>
        <div
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '8px 22px',
            borderRadius: 999,
            background: `${p.accent}2e`,
            border: `2px solid ${p.accent}`,
            color: p.accent,
            fontSize: 26,
            fontWeight: 800,
          }}
        >
          {tag}
        </div>
        {p.name !== 'neo-brutal' && <Shine start={20} radius={p.radius} />}
      </div>

      {flying && (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={1080} height={1920}>
          <path
            d={`M 360 340 Q 700 90 ${pos.x + 30} ${pos.y + 30}`}
            stroke={p.accent}
            strokeWidth="6"
            strokeDasharray="4 26"
            strokeLinecap="round"
            fill="none"
            opacity="0.8"
          />
        </svg>
      )}
      {flying && (
        <div style={{ position: 'absolute', left: pos.x, top: pos.y, transform: `rotate(${((v.direction * 180) / Math.PI) * 0.35}deg) scale(1.25)` }}>
          <MailIcon size={64} color={p.accent} />
        </div>
      )}

      <div
        style={p.card({
          position: 'absolute',
          right: 64,
          top: 460 + floatY(frame, 8),
          padding: '26px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          transform: `translateX(${(1 - toast) * 560}px)`,
          opacity: toast * out,
        })}
      >
        <MailIcon size={46} color={p.accent} flapOpen={Math.min(1, Math.max(0, (frame - toastAt - 18) / 16))} />
        <div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{toastTitle}</div>
          <div style={{ fontSize: 24, fontWeight: 600, opacity: 0.65 }}>{toastSub}</div>
        </div>
      </div>

      {typingLabel && (
        <div
          style={p.card({
            position: 'absolute',
            right: 64,
            top: 600 + floatY(frame, 4),
            padding: '18px 30px',
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            transform: `scale(${typing})`,
            opacity: typing * out,
          })}
        >
          <span style={{ fontSize: 26, fontWeight: 700, opacity: 0.75 }}>{typingLabel}</span>
          <TypingDots frame={frame} color={p.accent} />
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- ApprovePanel: mock + button, cursor click, rays, follow-up pill ----------
export const ApprovePanel: React.FC<{
  p: Preset;
  dur: number;
  title: string;
  sub: string;
  buttonIdle: string;
  buttonDone: string;
  pill?: string;
  clickAt?: number;
}> = ({ p, dur, title, sub, buttonIdle, buttonDone, pill, clickAt = 60 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useIn(4, 12);
  const out = fadeOut(frame, dur - 22);

  const cx = interpolate(frame, [20, clickAt], [980, 640], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.3, 1) });
  const cy = interpolate(frame, [20, clickAt], [820, 560], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.3, 1) });
  const clicked = frame >= clickAt;
  const press = dampedSettle(frame - clickAt, 0.16, 0.2);
  const ripple = interpolate(frame, [clickAt, clickAt + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const check = interpolate(frame, [clickAt + 10, clickAt + 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pillS = spring({ frame: frame - (clickAt + 66), fps, config: { damping: 12 }, durationInFrames: 36 });
  const cursorFade = interpolate(frame, [clickAt + 8, clickAt + 24], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <div
        style={p.card({
          position: 'absolute',
          left: 110,
          right: 110,
          top: 150 + floatY(frame, 1, 4),
          padding: '34px 38px',
          transform: `scale(${0.75 + s * 0.25}) translateY(${(1 - s) * 80}px)`,
          opacity: s * out,
        })}
      >
        <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
          <MiniMock w={330} accent={p.accent} accent2={p.accent2} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 24, fontWeight: 600, opacity: 0.6, marginBottom: 22 }}>{sub}</div>
            <div
              style={{
                position: 'relative',
                borderRadius: Math.min(20, p.radius),
                padding: '20px 10px',
                textAlign: 'center',
                fontSize: 34,
                fontWeight: 800,
                color: p.onAccent,
                background: clicked ? `linear-gradient(135deg, ${p.accent}, ${p.accent2})` : p.accent,
                transform: `scale(${1 - press * 0.12})`,
                boxShadow: `0 12px 30px ${p.accent}59`,
                overflow: 'hidden',
              }}
            >
              {check > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                  <CheckDraw size={40} color={p.onAccent} progress={check} strokeWidth={6} /> {buttonDone}
                </span>
              ) : (
                buttonIdle
              )}
              {ripple > 0 && ripple < 1 && (
                <span
                  style={{
                    position: 'absolute',
                    left: '46%',
                    top: '30%',
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    border: '3px solid rgba(255,255,255,0.9)',
                    transform: `translate(-50%,-50%) scale(${1 + ripple * 9})`,
                    opacity: 1 - ripple,
                  }}
                />
              )}
            </div>
          </div>
        </div>
        {p.name !== 'neo-brutal' && <Shine start={16} radius={p.radius} />}
      </div>

      {clicked && frame < clickAt + 50 && (
        <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[...Array(8)].map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const r1 = 90 + ripple * 130;
            const r2 = r1 + 44 * (1 - ripple);
            return (
              <line
                key={i}
                x1={645 + Math.cos(a) * r1}
                y1={565 + Math.sin(a) * r1}
                x2={645 + Math.cos(a) * r2}
                y2={565 + Math.sin(a) * r2}
                stroke={p.accent2}
                strokeWidth="7"
                strokeLinecap="round"
                opacity={1 - ripple}
              />
            );
          })}
        </svg>
      )}

      {pill && (
        <div
          style={p.card({
            position: 'absolute',
            left: 64,
            top: 664,
            width: 480,
            padding: '18px 10px',
            borderRadius: 999,
            textAlign: 'center',
            transform: `scale(${pillS})`,
            opacity: pillS * out,
            fontSize: 30,
            fontWeight: 800,
          })}
        >
          {pill}
        </div>
      )}

      <div style={{ position: 'absolute', left: cx, top: cy, opacity: cursorFade * s * out }}>
        <CursorIcon />
      </div>
    </AbsoluteFill>
  );
};

// ---------- CtaPill: pulsing action button + sparkles, over the running footage ----------
export const CtaPill: React.FC<{
  p: Preset;
  dur: number;
  label: string;
  top?: number;
  sparks?: { x: number; y: number; d: number }[];
}> = ({ p, dur, label, top = 300, sparks }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useIn(2, 11);
  const pulse = 1 + Math.sin(frame / 11) * 0.025;
  const out = fadeOut(frame, dur - 14, 14);
  const SPARKS = sparks ?? [
    { x: 180, y: 250, d: 16 },
    { x: 850, y: 230, d: 28 },
    { x: 130, y: 460, d: 40 },
    { x: 900, y: 470, d: 52 },
    { x: 540, y: 190, d: 64 },
  ];
  return (
    <AbsoluteFill>
      {SPARKS.map((sp, i) => {
        const t = spring({ frame: frame - sp.d, fps, config: { damping: 10 }, durationInFrames: 34 });
        return (
          <div key={i} style={{ position: 'absolute', left: sp.x, top: sp.y + floatY(frame, i, 8), opacity: out }}>
            <Sparkle t={t} size={i % 2 ? 30 : 42} color={i % 2 ? p.accent : p.accent2} />
          </div>
        );
      })}
      <div
        style={p.card({
          position: 'absolute',
          left: 0,
          right: 0,
          top,
          margin: '0 auto',
          width: 640,
          padding: '34px 10px',
          borderRadius: 999,
          textAlign: 'center',
          background: `linear-gradient(135deg, ${p.accent}c0, ${p.accent2}90)`,
          border: '2px solid rgba(255,255,255,0.85)',
          boxShadow: `0 0 ${40 + Math.sin(frame / 9) * 18}px ${p.accent2}a6, 0 24px 60px rgba(0,0,0,0.25)`,
          transform: `scale(${s * pulse})`,
          opacity: s * out,
          fontSize: 52,
          fontWeight: 800,
          color: p.onAccent,
          textShadow: '0 2px 12px rgba(0,0,0,0.25)',
        })}
      >
        {label}
        {p.name !== 'neo-brutal' && <Shine start={30} dur={50} radius={999} />}
      </div>
    </AbsoluteFill>
  );
};
