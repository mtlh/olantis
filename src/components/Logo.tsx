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
        <svg width={size * 0.88} height={size * 0.88} viewBox="0 0 100 100" fill="none" className="block">
          <g transform="translate(50,50)">
            <rect x="-35" y="-35" width="70" height="70" rx="15.5" fill="none" stroke="white" strokeWidth="3.9" />
            <rect x="-24.4" y="-24.4" width="48.8" height="48.8" rx="10.9" fill="white" />
            <g transform="translate(-12.5,-1)">
              <path d="M0 6.6 L6.25 2.5 L12.5 4.3 L25 0" fill="none" stroke="#0f0f12" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="25" cy="0" r="3.5" fill="#10b981" stroke="white" strokeWidth="0.48" />
            </g>
          </g>
        </svg>
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
