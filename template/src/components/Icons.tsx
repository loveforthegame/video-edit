// Hand-built animated SVG icons. All animation inputs are plain 0..1 props
// so every icon stays a pure function of the current frame.

export const MailIcon: React.FC<{ size?: number; color?: string; flapOpen?: number }> = ({
  size = 44,
  color = '#0C2418',
  flapOpen = 0,
}) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <rect x="4" y="12" width="40" height="28" rx="6" stroke={color} strokeWidth="3.4" fill="rgba(255,255,255,0.5)" />
    <path
      d={`M6 ${16 - flapOpen * 10} L24 ${30 - flapOpen * 22} L42 ${16 - flapOpen * 10}`}
      stroke={color}
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export const BellIcon: React.FC<{ size?: number; color?: string; wiggle?: number }> = ({
  size = 40,
  color = '#0C2418',
  wiggle = 0,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    style={{ transform: `rotate(${wiggle}deg)`, transformOrigin: '50% 12%' }}
  >
    <path
      d="M24 6c-7 0-12 5.5-12 13v8l-4 7h32l-4-7v-8c0-7.5-5-13-12-13Z"
      stroke={color}
      strokeWidth="3.4"
      strokeLinejoin="round"
      fill="rgba(255,255,255,0.55)"
    />
    <path d="M19 38a5 5 0 0 0 10 0" stroke={color} strokeWidth="3.4" strokeLinecap="round" fill="none" />
  </svg>
);

/** Checkmark that draws itself. progress 0..1 */
export const CheckDraw: React.FC<{ size?: number; color?: string; progress: number; strokeWidth?: number }> = ({
  size = 40,
  color = '#17A94E',
  progress,
  strokeWidth = 5,
}) => {
  const LEN = 62;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path
        d="M10 26 L20 36 L39 14"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={LEN}
        strokeDashoffset={LEN * (1 - Math.min(1, Math.max(0, progress)))}
      />
    </svg>
  );
};

export const CursorIcon: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <path
      d="M12 4 L38 26 L24.5 28.5 L31 42 L25 44.5 L18.8 30.6 L9 39 Z"
      fill="#111"
      stroke="#fff"
      strokeWidth="2.6"
      strokeLinejoin="round"
    />
  </svg>
);

/** 4-point star; t 0..1 drives scale+spin on entrance. */
export const Sparkle: React.FC<{ size?: number; color?: string; t: number }> = ({ size = 34, color = '#46E065', t }) => {
  const s = Math.min(1, Math.max(0, t));
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ transform: `scale(${s}) rotate(${t * 90}deg)` }}>
      <path d="M24 2 L29 19 L46 24 L29 29 L24 46 L19 29 L2 24 L19 19 Z" fill={color} opacity={0.95} />
    </svg>
  );
};

/** Rounded-square brand mark with a check. Swap for a real logo via staticFile when provided. */
export const LogoMark: React.FC<{ size?: number; color?: string }> = ({ size = 84, color = '#17A94E' }) => (
  <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <rect x="6" y="6" width="84" height="84" rx="24" fill={color} />
    <rect x="6" y="6" width="84" height="84" rx="24" fill="url(#lg)" />
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="96" y2="96">
        <stop offset="0" stopColor="rgba(255,255,255,0.35)" />
        <stop offset="1" stopColor="rgba(255,255,255,0)" />
      </linearGradient>
    </defs>
    <path d="M26 50 L42 66 L72 32" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

/** Tiny wireframe mock standing in for "a design under review". */
export const MiniMock: React.FC<{ w: number; accent?: string; accent2?: string }> = ({
  w,
  accent = '#17A94E',
  accent2 = '#46E065',
}) => (
  <svg width={w} height={w * 0.62} viewBox="0 0 200 124" fill="none">
    <rect x="2" y="2" width="196" height="120" rx="10" fill="rgba(255,255,255,0.75)" stroke="rgba(12,36,24,0.25)" strokeWidth="2" />
    <rect x="14" y="14" width="80" height="12" rx="6" fill={accent} opacity="0.85" />
    <rect x="14" y="36" width="172" height="8" rx="4" fill="rgba(12,36,24,0.22)" />
    <rect x="14" y="52" width="140" height="8" rx="4" fill="rgba(12,36,24,0.22)" />
    <rect x="14" y="74" width="76" height="34" rx="8" fill={accent2} opacity="0.9" />
    <rect x="100" y="74" width="86" height="34" rx="8" fill="rgba(12,36,24,0.12)" />
  </svg>
);

/** iOS-style switch; on 0..1 (feed it a spring). */
export const Toggle: React.FC<{ on: number; accent?: string; accent2?: string }> = ({
  on,
  accent = '#17A94E',
  accent2 = '#46E065',
}) => (
  <div
    style={{
      width: 108,
      height: 58,
      borderRadius: 999,
      background: `linear-gradient(90deg, ${accent}, ${accent2})`,
      opacity: 0.25 + on * 0.75,
      position: 'relative',
      boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.18)',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 5,
        left: 5 + on * 50,
        width: 48,
        height: 48,
        borderRadius: 24,
        background: '#fff',
        boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
      }}
    />
  </div>
);

/** Three bouncing dots ("someone is typing/viewing"). */
export const TypingDots: React.FC<{ frame: number; color?: string }> = ({ frame, color = '#17A94E' }) => (
  <>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          background: color,
          display: 'inline-block',
          transform: `translateY(${Math.sin((frame - i * 8) / 7) * -6}px)`,
          opacity: 0.5 + 0.5 * Math.max(0, Math.sin((frame - i * 8) / 7)),
        }}
      />
    ))}
  </>
);
