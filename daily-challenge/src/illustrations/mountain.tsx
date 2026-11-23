import { GROUND, INK, INK_SOFT, Pine, Plate, STONE_MID } from "./Plate.tsx";

function Range({ snow = true }: { snow?: boolean }) {
  return (
    <>
      <path d="M0 150L60 92l30 22 52-70 46 50 34-30 60 64 40-40 78 74V260H0Z" fill="#cdb995" stroke={INK} strokeWidth="0.9" />
      {snow && (
        <path d="M120 72l22-28 20 22-8-2-6 8-6-6-8 10-4-6Z M222 98l34-30 22 24-10-2-8 8-10-6-8 6Z M302 120l16-16 16 16-8 2-6-4Z"
          fill="#f8f4ea" stroke={INK} strokeWidth="0.6" />
      )}
      <path d="M142 44l-12 60M256 68l-14 70M90 114l-16 40" stroke={INK} strokeWidth="0.5" strokeOpacity="0.5" />
    </>
  );
}

export function Survey({ label }: { label: string }) {
  return (
    <Plate sky="day" label={label} sun={{ x: 320, y: 50, r: 12 }}>
      {ids => (
        <>
          <g opacity="0.75"><Range /></g>
          <path d="M0 190c90-14 200-10 400 4V260H0Z" fill={GROUND} stroke={INK} strokeWidth="0.7" />
          <rect x="0" y="190" width="400" height="70" fill={`url(#${ids.hatch})`} opacity="0.18" />
          {/* tripod */}
          <path d="M200 130L160 238M200 130l42 108M200 130l4 112" stroke="#6a4c30" strokeWidth="4" strokeLinecap="round" />
          <path d="M184 176h34" stroke={INK} strokeWidth="1" />
          {/* theodolite */}
          <rect x="186" y="118" width="28" height="14" rx="2" fill="#a68a5c" stroke={INK} strokeWidth="0.9" />
          <path d="M190 118v-22h20v22" fill="#b89a69" stroke={INK} strokeWidth="0.9" />
          <rect x="176" y="92" width="52" height="11" rx="5" fill="#8a7048" stroke={INK} strokeWidth="0.9" />
          <circle cx="228" cy="97" r="7" fill="#d8cdb6" stroke={INK} strokeWidth="0.9" />
          <circle cx="200" cy="114" r="5" fill="#d8cdb6" stroke={INK} strokeWidth="0.8" />
          {/* rolled maps and a level */}
          <g transform="translate(62 214) rotate(-8)">
            <rect width="74" height="14" rx="7" fill="#efe3cb" stroke={INK} strokeWidth="0.8" />
            <ellipse cx="74" cy="7" rx="4" ry="7" fill="#e0cfaf" stroke={INK} strokeWidth="0.8" />
          </g>
          <g transform="translate(70 230) rotate(4)">
            <rect width="64" height="12" rx="6" fill="#e9dcc2" stroke={INK} strokeWidth="0.8" />
          </g>
          <path d="M280 224h80l-6 10h-68Z" fill={STONE_MID} stroke={INK} strokeWidth="0.8" />
          <path d="M300 214c4-8 14-8 18 0v10h-18Z" fill="#efe3cb" stroke={INK} strokeWidth="0.8" />
          <text x="390" y="250" textAnchor="end" fontFamily="EB Garamond Variable, serif" fontStyle="italic" fontSize="11" fill={INK_SOFT}>Survey, north approach</text>
        </>
      )}
    </Plate>
  );
}

export function Pass({ label }: { label: string }) {
  return (
    <Plate sky="dusk" label={label} sun={{ x: 70, y: 70, r: 14 }}>
      {ids => (
        <>
          <path d="M0 120L70 80l50 30 60-70 40 46 30-26 50 46 40-30 60 50V260H0Z" fill="#d6c19c" stroke={INK} strokeWidth="0.8" opacity="0.7" />
          <path d="M0 160L80 100l60 40 60-62 60 56 50-36 90 70V260H0Z" fill="#c9b18a" stroke={INK} strokeWidth="1" />
          <path d="M180 92l20-14 22 20-10-2-8 6-8-6Z M262 128l18-12 18 14-10 0-6 4Z" fill="#f8f4ea" stroke={INK} strokeWidth="0.6" />
          <rect x="0" y="100" width="400" height="160" fill={`url(#${ids.hatch})`} opacity="0.12" />
          {/* the switchback road up to the saddle */}
          <path d="M120 250L270 232 150 214 262 196 166 180 248 164 184 150 232 138 200 126" fill="none" stroke="#f3e6cf" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M120 250L270 232 150 214 262 196 166 180 248 164 184 150 232 138 200 126" fill="none" stroke={INK} strokeWidth="0.7" strokeDasharray="2 3" strokeLinejoin="round" />
          {/* pines */}
          {[[30, 236], [48, 244], [66, 232], [320, 240], [338, 230], [356, 246], [374, 236], [300, 250], [90, 252]].map(([x, y], i) => <Pine key={i} x={x} y={y} h={26 + (i % 3) * 6} />)}
          <path d="M0 246c60-6 120 4 200 2s140-6 200-2V260H0Z" fill="#cdb48c" stroke={INK} strokeWidth="0.6" />
          {/* a mule train */}
          {[140, 152, 164].map((x, i) => <path key={i} d={`M${x} 246h8v-4h-8ZM${x + 1} 246v3M${x + 7} 246v3`} fill={INK} stroke={INK} strokeWidth="0.8" />)}
        </>
      )}
    </Plate>
  );
}

export function Avalanche({ label }: { label: string }) {
  return (
    <Plate sky="cold" label={label}>
      {ids => (
        <>
          <path d="M0 40L120 20l80 30 90-36 110 40V260H0Z" fill="#f3f1ea" stroke={INK} strokeWidth="0.9" />
          <path d="M0 40L120 20l80 30 90-36 110 40" fill="none" stroke={INK} strokeWidth="1" />
          {/* forest with an avalanche path cut through it */}
          {Array.from({ length: 70 }, (_, i) => {
            const x = (i * 53) % 400;
            const y = 90 + ((i * 29) % 120);
            if (x > 160 && x < 240 + (y - 90) * 0.3 && x > 160 + (y - 90) * 0.25) return null;
            return <Pine key={i} x={x} y={y} h={14 + (i % 4) * 3} snow />;
          })}
          <path d="M170 50c10 60 20 120 40 170h50c-20-60-40-120-56-170Z" fill="#fbfaf6" stroke={INK} strokeWidth="0.5" strokeDasharray="3 3" />
          <path d="M190 80c4 30 14 70 30 120M206 70c6 40 18 90 36 140" stroke={INK_SOFT} strokeWidth="0.4" strokeOpacity="0.3" />
          {/* the track and a snow shed */}
          <path d="M0 222h400" stroke={INK} strokeWidth="1.2" />
          <path d="M0 230h400" stroke={INK} strokeWidth="1.2" />
          {Array.from({ length: 40 }, (_, i) => <path key={i} d={`M${i * 10} 220v12`} stroke={INK} strokeWidth="0.7" />)}
          <path d="M150 212h130v-12c-40-10-90-10-130 0Z" fill="#cdb894" stroke={INK} strokeWidth="0.9" />
          {[160, 180, 200, 220, 240, 260].map(x => <path key={x} d={`M${x} 212v20`} stroke={INK} strokeWidth="2" />)}
          <rect x="150" y="200" width="130" height="12" fill={`url(#${ids.hatchDense})`} opacity="0.5" />
          <path d="M0 236c80 6 200 10 400 0V260H0Z" fill="#ecebe4" stroke={INK} strokeWidth="0.6" />
        </>
      )}
    </Plate>
  );
}
