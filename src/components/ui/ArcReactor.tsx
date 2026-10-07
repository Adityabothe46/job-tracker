/**
 * The app logo: an arc-reactor emblem drawn as HUD line-work — navy housing,
 * cyan outer ring with graduations, segmented coil, glowing core. Pure SVG.
 */
export function ArcReactor({ size = 36 }: { size?: number }) {
  const segments = Array.from({ length: 10 }, (_, i) => i * 36);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className="drop-shadow-[0_0_6px_rgb(92_225_255_/_0.55)]"
    >
      <defs>
        <radialGradient id="arc-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#9aeeff" />
          <stop offset="100%" stopColor="#0b7390" />
        </radialGradient>
      </defs>
      {/* housing + graduated outer ring */}
      <circle cx="20" cy="20" r="19" fill="#06121c" stroke="#5ce1ff" strokeOpacity="0.8" strokeWidth="1.2" />
      <circle
        cx="20"
        cy="20"
        r="16.6"
        fill="none"
        stroke="#5ce1ff"
        strokeOpacity="0.45"
        strokeWidth="1.4"
        strokeDasharray="0.8 2.1"
      />
      {/* coil segments */}
      {segments.map((angle) => (
        <rect
          key={angle}
          x="18.5"
          y="6.4"
          width="3"
          height="5.2"
          rx="0.6"
          fill="#5ce1ff"
          opacity="0.5"
          transform={`rotate(${angle} 20 20)`}
        />
      ))}
      {/* inner ring + core */}
      <circle cx="20" cy="20" r="8.4" fill="none" stroke="#9aeeff" strokeOpacity="0.7" strokeWidth="1" />
      <circle cx="20" cy="20" r="6.2" fill="url(#arc-core)" />
    </svg>
  );
}
