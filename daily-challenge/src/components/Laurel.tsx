import type { ReactNode } from "react";

// Laurel branches framing a score or a streak, as in the reference design.
export function Laurel({ children, size = 168 }: { children: ReactNode; size?: number }) {
  const leaves = Array.from({ length: 7 }, (_, i) => i);
  const branch = (flip: boolean) => (
    <svg viewBox="0 0 60 120" width={size * 0.32} height={size * 0.64} aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M44 114C18 98 8 64 22 14" fill="none" stroke="#8a5d33" strokeWidth="2.2" strokeLinecap="round" />
      {leaves.map(i => {
        const t = i / 6;
        const x = 44 - 30 * t + 10 * Math.sin(t * 3);
        const y = 112 - 96 * t;
        return (
          <g key={i}>
            <path d={`M${x} ${y}c-10-2-16-10-14-18 9 1 15 8 14 18Z`} fill="#8a5d33" />
            {i < 6 && <path d={`M${x + 1} ${y - 2}c8-6 16-6 20-1-6 6-14 6-20 1Z`} fill="#a87a4b" />}
          </g>
        );
      })}
    </svg>
  );
  return (
    <div className="flex items-center justify-center gap-1">
      {branch(false)}
      <div className="min-w-24 text-center">{children}</div>
      {branch(true)}
    </div>
  );
}
