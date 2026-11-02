/** The "O" ring, broken at the top-right for the live status bead. */
const RING_PATH = "M56.99 23.92 A27 27 0 1 0 76.08 43.01";

export function LogoGlyph({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={`block ${className}`}
    >
      <path d={RING_PATH} stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <circle cx="69.09" cy="30.91" r="6.2" fill="#10b981" />
    </svg>
  );
}

export function Logo({ size = 36, showText = true, className = "" }: { size?: number; showText?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="relative shrink-0 grid place-items-center shadow-lg"
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.26,
          background: "#111114",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <LogoGlyph size={size} />
      </div>
      {showText && (
        <div className="leading-none">
          <div className="font-semibold tracking-tight text-white text-[15px]">Olantis</div>
          <div className="text-[11px] tracking-[0.13em] uppercase text-zinc-500">Portfolio</div>
        </div>
      )}
    </div>
  );
}
export function LogoMark({ size = 36 }: { size?: number }) {
  return <Logo size={size} showText={false} />;
}
