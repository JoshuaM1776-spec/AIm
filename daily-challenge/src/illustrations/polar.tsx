import { INK, INK_SOFT, Plate } from "./Plate.tsx";

function Tent({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0L30-52 62 0Z" fill="#e9dcc1" stroke={INK} strokeWidth="1" />
      <path d="M30-52L44 0" stroke={INK} strokeWidth="0.8" />
      <path d="M30-52L44 0H62Z" fill="#cdb894" />
      <path d="M26-58l4 6 4-6" stroke={INK} strokeWidth="1.2" fill="none" />
      <path d="M-6 2h76" stroke={INK} strokeWidth="1" />
      <path d="M22 0l6-18 6 18Z" fill="#5d4a39" />
    </g>
  );
}

function Sledge({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0h110c10 0 14-8 12-12" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M8 0v-8M40 0v-8M72 0v-8M100 0v-8" stroke={INK} strokeWidth="1.4" />
      <path d="M4-8h104" stroke={INK} strokeWidth="1.6" />
      <rect x="10" y="-30" width="30" height="22" fill="#b38e5e" stroke={INK} strokeWidth="0.9" />
      <rect x="42" y="-26" width="34" height="18" fill="#c29d6c" stroke={INK} strokeWidth="0.9" />
      <rect x="78" y="-22" width="24" height="14" fill="#a9845a" stroke={INK} strokeWidth="0.9" />
      <path d="M10-19h30M42-17h34" stroke={INK} strokeWidth="0.5" />
    </g>
  );
}

export function PolarCamp({ label }: { label: string }) {
  return (
    <Plate sky="cold" label={label} sun={{ x: 300, y: 150, r: 12 }}>
      {ids => (
        <>
          {/* sun halo, common in polar skies */}
          <circle cx="300" cy="150" r="46" fill="none" stroke="#f1d9a8" strokeWidth="1.2" strokeOpacity="0.8" />
          <path d="M0 160h400" stroke={INK} strokeWidth="0.8" />
          <path d="M0 160h400V260H0Z" fill="#f4f2ec" />
          <path d="M0 176h400M0 196h400M0 222h400" stroke={INK_SOFT} strokeWidth="0.4" strokeOpacity="0.5" />
          <path d="M20 168c40-4 80 2 120-2M210 172c50-4 90 0 160-4M40 204c60-6 120 2 160-2M240 212c40-4 90 0 140-4" stroke={INK} strokeWidth="0.5" strokeOpacity="0.4" fill="none" />
          <Tent x={70} y={212} s={1.1} />
          <Tent x={160} y={206} s={0.9} />
          <Sledge x={230} y={222} s={1} />
          {/* skis planted in the snow */}
          <path d="M380 216l-6-60M386 216l-4-60" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M360 162l24 0" stroke={INK} strokeWidth="0.8" />
          <rect x="0" y="160" width="400" height="100" fill={`url(#${ids.hatch})`} opacity="0.06" />
          {/* figures */}
          <g fill={INK}>
            <circle cx="214" cy="184" r="3" />
            <path d="M210 188h8l2 14h-3l-1 16h-2l-1-12-1 12h-2l-1-16h-3Z" />
          </g>
        </>
      )}
    </Plate>
  );
}

export function IceField({ label }: { label: string }) {
  return (
    <Plate sky="overcast" label={label}>
      {ids => (
        <>
          <path d="M0 140h400V260H0Z" fill="#eeede6" />
          {/* open leads of dark water */}
          <path d="M0 200c60-6 90 6 140 0s60-10 110-4 80 8 150 2v8c-70 6-100-4-150 0s-70 8-110 4-80 4-140 0Z" fill="#7d8580" stroke={INK} strokeWidth="0.7" />
          <path d="M210 168c30-3 50 3 80 0v5c-30 3-50-3-80 0Z" fill="#7d8580" stroke={INK} strokeWidth="0.6" />
          {/* pressure ridges: tumbled blocks */}
          {Array.from({ length: 24 }, (_, i) => {
            const x = 6 + i * 17;
            const h = 12 + ((i * 7) % 18);
            const y = 150 + ((i * 5) % 8);
            return <path key={i} d={`M${x} ${y}l${6} ${-h} ${10} ${4} ${4} ${h - 4}Z`} fill={i % 3 ? "#f6f5f0" : "#dcdcd4"} stroke={INK} strokeWidth="0.7" />;
          })}
          {Array.from({ length: 14 }, (_, i) => {
            const x = 20 + i * 28;
            const h = 18 + ((i * 11) % 22);
            return <path key={i} d={`M${x} 248l${8} ${-h} ${14} ${6} ${6} ${h - 6}Z`} fill={i % 2 ? "#f9f8f4" : "#e2e2da"} stroke={INK} strokeWidth="0.8" />;
          })}
          <rect x="0" y="140" width="400" height="120" fill={`url(#${ids.hatch})`} opacity="0.08" />
          {/* drifting snow */}
          <path d="M20 120c40-4 70 2 110-2M150 104c50-4 90 0 140-4M260 128c40-2 70 2 120-2M40 90c30-2 60 0 90-2" stroke="#fff" strokeWidth="1.4" strokeOpacity="0.8" fill="none" />
          <path d="M0 140h400" stroke={INK} strokeWidth="0.8" />
        </>
      )}
    </Plate>
  );
}

export function Rations({ label }: { label: string }) {
  return (
    <Plate sky="cold" label={label}>
      {ids => (
        <>
          <path d="M0 190h400V260H0Z" fill="#f2f0e9" />
          <path d="M0 190h400" stroke={INK} strokeWidth="0.8" />
          {/* sledge base */}
          <path d="M30 226h320c14 0 20-10 16-16" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M40 226v-10M140 226v-10M240 226v-10M330 226v-10" stroke={INK} strokeWidth="1.8" />
          <path d="M34 216h312" stroke={INK} strokeWidth="2" />
          {/* crates */}
          {[[46, 136, 90, 80], [140, 150, 80, 66], [140, 112, 70, 38]].map(([x, y, w, h], i) => (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h} fill={["#b38e5e", "#c29d6c", "#a98657"][i]} stroke={INK} strokeWidth="1" />
              {Array.from({ length: Math.floor(h / 14) }, (_, j) => <path key={j} d={`M${x} ${y + 14 * (j + 1)}h${w}`} stroke={INK} strokeWidth="0.5" strokeOpacity="0.6" />)}
              <path d={`M${x + 4} ${y + 4}l${w - 8} ${h - 8}`} stroke={INK} strokeWidth="0.6" strokeOpacity="0.5" />
            </g>
          ))}
          <text x="91" y="182" textAnchor="middle" fontFamily="EB Garamond Variable, serif" fontSize="11" fill="#3b2a1c" letterSpacing="2">PEMMICAN</text>
          <text x="180" y="192" textAnchor="middle" fontFamily="EB Garamond Variable, serif" fontSize="10" fill="#3b2a1c" letterSpacing="2">BISCUIT</text>
          {/* paraffin tin */}
          <rect x="236" y="148" width="44" height="68" fill="#8d8f86" stroke={INK} strokeWidth="1" />
          <path d="M270 148v-10h8v10" fill="#6e7068" stroke={INK} strokeWidth="0.9" />
          <rect x="236" y="148" width="14" height="68" fill={`url(#${ids.hatch})`} opacity="0.6" />
          <text x="258" y="188" textAnchor="middle" fontFamily="EB Garamond Variable, serif" fontSize="6.5" fill="#f2efe6" letterSpacing="0.5">PARAFFIN</text>
          {/* tally card */}
          <g transform="translate(296 132) rotate(6)">
            <rect width="62" height="80" fill="#f8f2e4" stroke={INK} strokeWidth="0.9" />
            <text x="31" y="14" textAnchor="middle" fontFamily="EB Garamond Variable, serif" fontStyle="italic" fontSize="9" fill={INK_SOFT}>Days left</text>
            {Array.from({ length: 4 }, (_, r) => (
              <g key={r} stroke={INK} strokeWidth="0.8">
                {Array.from({ length: 4 }, (_, i) => <path key={i} d={`M${10 + i * 4} ${30 + r * 12}v-8`} />)}
                <path d={`M8 ${28 + r * 12}l18 -6`} />
                {r < 3 && <path d={`M34 ${30 + r * 12}v-8M38 ${30 + r * 12}v-8`} />}
              </g>
            ))}
          </g>
        </>
      )}
    </Plate>
  );
}
