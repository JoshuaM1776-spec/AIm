// Shared drawing kit for the challenge illustrations: a warm sky, ink lines and hatching, in the
// style of an engraved book plate. Every scene draws into a 400 × 260 canvas.
import { type ReactNode, useId } from "react";

export const INK = "#4a3424";
export const INK_SOFT = "#7a5c43";
export const STONE = "#e9dcc6";
export const STONE_MID = "#d8c3a1";
export const STONE_DARK = "#b99d78";
export const GROUND = "#e2cfae";
export const FOLIAGE = "#9c8a62";
export const WATER = "#c9c2ad";

export type Sky = "dusk" | "day" | "overcast" | "cold" | "paper" | "night";
const SKIES: Record<Sky, [string, string, string]> = {
  dusk: ["#efcf9f", "#f6e4c8", "#f4ead9"],
  day: ["#e8dcc5", "#f2e9d8", "#f5eee2"],
  overcast: ["#d9d2c4", "#e8e2d6", "#f1ece3"],
  cold: ["#d8dcd8", "#ebe8df", "#f5f1e8"],
  paper: ["#f4ecdd", "#f4ecdd", "#f4ecdd"],
  night: ["#5b4636", "#7b604a", "#9c7e60"],
};

export interface Ids { sky: string; hatch: string; hatchDense: string; glow: string; fade: string }

export function Plate({ sky = "dusk", children, label, sun }: { sky?: Sky; children: (ids: Ids) => ReactNode; label: string; sun?: { x: number; y: number; r?: number } }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids: Ids = { sky: `sky${raw}`, hatch: `h${raw}`, hatchDense: `hd${raw}`, glow: `g${raw}`, fade: `f${raw}` };
  const [top, mid, bottom] = SKIES[sky];
  return (
    <svg viewBox="0 0 400 260" role="img" aria-label={label} className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.sky} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.6" stopColor={mid} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id={ids.glow}>
          <stop offset="0" stopColor="#fbe7c2" stopOpacity="1" />
          <stop offset="0.35" stopColor="#f6d6a2" stopOpacity="0.7" />
          <stop offset="1" stopColor="#f6d6a2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.fade} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.08" />
        </linearGradient>
        <pattern id={ids.hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={INK} strokeWidth="0.7" strokeOpacity="0.45" />
        </pattern>
        <pattern id={ids.hatchDense} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3" stroke={INK} strokeWidth="0.8" strokeOpacity="0.55" />
        </pattern>
      </defs>
      <rect width="400" height="260" fill={`url(#${ids.sky})`} />
      {sun && (
        <>
          <circle cx={sun.x} cy={sun.y} r={(sun.r ?? 18) * 5} fill={`url(#${ids.glow})`} />
          <circle cx={sun.x} cy={sun.y} r={sun.r ?? 18} fill="#f9e2b8" />
        </>
      )}
      {children(ids)}
      <rect width="400" height="260" fill={`url(#${ids.fade})`} />
    </svg>
  );
}

/** A row of round-topped arches cut out of a wall, for aqueducts and arcades. */
export function arcadePath(x: number, y: number, width: number, height: number, count: number, pier: number) {
  const span = (width - pier * (count + 1)) / count;
  const r = span / 2;
  let d = `M${x} ${y}h${width}v${height}h${-width}Z`;
  for (let i = 0; i < count; i++) {
    const ax = x + pier + i * (span + pier);
    const top = y + Math.min(height * 0.22, 10) + r;
    d += ` M${ax} ${y + height}V${top}a${r} ${r} 0 0 1 ${span} 0V${y + height}Z`;
  }
  return d;
}

export function Cypress({ x, y, h = 40 }: { x: number; y: number; h?: number }) {
  return (
    <g>
      <path d={`M${x} ${y - h}c${h * 0.12} ${h * 0.25} ${h * 0.2} ${h * 0.6} ${h * 0.12} ${h}h${-h * 0.24}c${-h * 0.08} ${-h * 0.4} 0 ${-h * 0.75} ${h * 0.12} ${-h}Z`} fill={FOLIAGE} stroke={INK} strokeWidth="0.8" />
      <path d={`M${x} ${y - h * 0.85}v${h * 0.8}`} stroke={INK} strokeWidth="0.5" strokeOpacity="0.5" />
    </g>
  );
}

export function Pine({ x, y, h = 30, snow = false }: { x: number; y: number; h?: number; snow?: boolean }) {
  const w = h * 0.45;
  return (
    <g>
      <path d={`M${x} ${y - h}L${x + w * 0.55} ${y - h * 0.55}h${-w * 0.2}L${x + w} ${y - h * 0.1}H${x - w}L${x - w * 0.35} ${y - h * 0.55}h${-w * 0.2}Z`}
        fill={snow ? "#8d8a73" : "#8a7a55"} stroke={INK} strokeWidth="0.7" />
      {snow && <path d={`M${x} ${y - h}l${w * 0.3} ${h * 0.25}h${-w * 0.6}Z`} fill="#f7f4ec" />}
      <rect x={x - 1.2} y={y - h * 0.1} width="2.4" height={h * 0.12} fill={INK} />
    </g>
  );
}

export function Figure({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g fill={INK} transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="-15" r="2.2" />
      <path d="M-2.6 -12.4h5.2l1.2 7.4-1.6.3L2 9h-1.6L0 0l-.4 9H-2l-.2-8.7-1.6-.3Z" />
    </g>
  );
}
