import { arcadePath, Cypress, Figure, FOLIAGE, GROUND, INK, INK_SOFT, Plate, STONE, STONE_MID, WATER } from "./Plate.tsx";

export function Aqueduct({ label }: { label: string }) {
  return (
    <Plate sky="dusk" label={label} sun={{ x: 92, y: 92, r: 16 }}>
      {ids => (
        <>
          {/* far hills */}
          <path d="M0 150C60 128 110 140 170 126s130-6 230 16V260H0Z" fill="#e4cfae" />
          <path d="M0 168c70-18 140-6 210-14s120 0 190 10V260H0Z" fill="#d8c09a" opacity="0.8" />
          {/* river */}
          <path d="M0 214c80-8 150 4 220-2s120-6 180 0V260H0Z" fill={WATER} />
          <path d="M30 226h60M140 232h80M260 224h70M60 240h90M210 246h110" stroke={INK} strokeWidth="0.6" strokeOpacity="0.35" />
          {/* lower tier */}
          <path d={arcadePath(10, 148, 380, 66, 7, 11)} fill={STONE} fillRule="evenodd" stroke={INK} strokeWidth="1" />
          {/* upper tier */}
          <path d={arcadePath(10, 112, 380, 36, 14, 6)} fill={STONE_MID} fillRule="evenodd" stroke={INK} strokeWidth="0.9" />
          {/* water channel on top */}
          <rect x="6" y="103" width="388" height="9" fill={STONE} stroke={INK} strokeWidth="0.9" />
          {/* shading on the piers' right sides */}
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={10 + i * ((380 - 11) / 7) + 5} y="160" width="6" height="54" fill={`url(#${ids.hatch})`} />
          ))}
          <path d="M10 130h380M10 172h380M10 194h380" stroke={INK} strokeWidth="0.4" strokeOpacity="0.5" />
          {/* reflections */}
          <path d="M40 222h26M95 222h30M150 224h28M205 222h30M262 224h28M318 222h30" stroke={INK} strokeWidth="1.2" strokeOpacity="0.25" />
          {/* foreground bank and trees */}
          <path d="M0 236c40-10 70-6 100 4v20H0Z" fill={GROUND} stroke={INK} strokeWidth="0.6" />
          <path d="M300 242c40-12 70-12 100-6v24H300Z" fill={GROUND} stroke={INK} strokeWidth="0.6" />
          <Cypress x={22} y={240} h={48} />
          <Cypress x={40} y={242} h={36} />
          <Cypress x={372} y={240} h={52} />
          <Cypress x={354} y={244} h={34} />
          <Figure x={330} y={244} s={0.6} />
        </>
      )}
    </Plate>
  );
}

export function AqueductSketch({ label }: { label: string }) {
  const pen = { stroke: INK_SOFT, strokeWidth: 0.9, fill: "none" } as const;
  return (
    <Plate sky="paper" label={label}>
      {() => (
        <>
          {/* faint construction grid */}
          {Array.from({ length: 13 }, (_, i) => <line key={`v${i}`} x1={i * 32} y1="0" x2={i * 32} y2="260" stroke={INK} strokeOpacity="0.06" />)}
          {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 32} x2="400" y2={i * 32} stroke={INK} strokeOpacity="0.06" />)}
          {/* valley contours */}
          <path d="M0 200c60-10 110 30 200 30s140-36 200-30" {...pen} strokeOpacity="0.6" />
          <path d="M0 214c60-6 110 30 200 30s140-30 200-24" {...pen} strokeOpacity="0.4" />
          {/* the aqueduct in perspective */}
          <path d="M20 96L380 128" {...pen} strokeWidth="1.4" />
          <path d="M20 104L380 134" {...pen} />
          {Array.from({ length: 9 }, (_, i) => {
            const x = 30 + i * 40;
            const y = 104 + (i * 40 * 30) / 360;
            const h = 120 - i * 6;
            const w = 30 - i * 1.2;
            return (
              <g key={i}>
                <path d={`M${x} ${y + h}V${y + 18}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}`} {...pen} />
                <path d={`M${x - 4} ${y + h}V${y + 6}`} {...pen} strokeOpacity="0.7" />
                {Array.from({ length: 6 }, (_, j) => (
                  <line key={j} x1={x - 4} y1={y + 20 + j * (h / 7)} x2={x} y2={y + 16 + j * (h / 7)} stroke={INK_SOFT} strokeWidth="0.5" />
                ))}
              </g>
            );
          })}
          {/* the slope annotation: a channel must fall gently all the way */}
          <path d="M40 70L360 98" stroke={INK} strokeWidth="0.8" strokeDasharray="4 4" />
          <path d="M352 92l8 6-9 3" {...pen} />
          <text x="200" y="68" textAnchor="middle" fontFamily="EB Garamond Variable, serif" fontStyle="italic" fontSize="13" fill={INK_SOFT}>gentle fall all the way</text>
          <text x="40" y="248" fontFamily="EB Garamond Variable, serif" fontStyle="italic" fontSize="12" fill={INK_SOFT}>Elevation across the valley</text>
        </>
      )}
    </Plate>
  );
}

export function Forum({ label }: { label: string }) {
  const cols = [0, 1, 2, 3, 4, 5];
  return (
    <Plate sky="dusk" label={label} sun={{ x: 330, y: 70, r: 14 }}>
      {ids => (
        <>
          <path d="M0 160c80-8 160-4 240-10s110 4 160 6V260H0Z" fill="#e3cdaa" />
          {/* side colonnades */}
          <path d={arcadePath(0, 150, 120, 46, 5, 6)} fill={STONE_MID} fillRule="evenodd" stroke={INK} strokeWidth="0.8" />
          <path d={arcadePath(280, 150, 120, 46, 5, 6)} fill={STONE_MID} fillRule="evenodd" stroke={INK} strokeWidth="0.8" />
          <rect x="0" y="144" width="120" height="6" fill={STONE} stroke={INK} strokeWidth="0.7" />
          <rect x="280" y="144" width="120" height="6" fill={STONE} stroke={INK} strokeWidth="0.7" />
          {/* temple podium and steps */}
          <rect x="118" y="168" width="164" height="30" fill={STONE_MID} stroke={INK} strokeWidth="0.9" />
          {[0, 1, 2, 3].map(i => <rect key={i} x={146 - i * 6} y={186 + i * 5} width={108 + i * 12} height="5" fill={STONE} stroke={INK} strokeWidth="0.6" />)}
          {/* columns */}
          {cols.map(i => (
            <g key={i}>
              <rect x={134 + i * 25} y="98" width="10" height="70" fill={STONE} stroke={INK} strokeWidth="0.8" />
              <path d={`M${137 + i * 25} 100v66M${141 + i * 25} 100v66`} stroke={INK} strokeWidth="0.4" strokeOpacity="0.6" />
              <rect x={131 + i * 25} y="94" width="16" height="5" fill={STONE_MID} stroke={INK} strokeWidth="0.7" />
            </g>
          ))}
          <rect x="140" y="98" width="128" height="70" fill={`url(#${ids.hatch})`} opacity="0.5" />
          {/* entablature and pediment */}
          <rect x="126" y="84" width="148" height="10" fill={STONE} stroke={INK} strokeWidth="0.9" />
          <path d="M122 84L200 52l78 32Z" fill={STONE} stroke={INK} strokeWidth="1" />
          <path d="M140 80L200 58l60 22" fill="none" stroke={INK} strokeWidth="0.6" />
          {/* paving in perspective */}
          <path d="M0 212h400M0 230h400M0 250h400M200 212L120 260M200 212L280 260M200 212L40 260M200 212L360 260" stroke={INK} strokeWidth="0.5" strokeOpacity="0.4" />
          <rect x="0" y="206" width="400" height="54" fill={GROUND} opacity="0.55" />
          <Figure x={96} y={226} s={0.75} />
          <Figure x={110} y={230} s={0.7} />
          <Figure x={300} y={232} s={0.8} />
          <Cypress x={20} y={146} h={44} />
          <Cypress x={384} y={146} h={46} />
          <path d="M60 148c-6-18 8-26 14-12 6-14 22-6 14 10" fill={FOLIAGE} stroke={INK} strokeWidth="0.6" opacity="0.6" />
        </>
      )}
    </Plate>
  );
}

export function Well({ label }: { label: string }) {
  return (
    <Plate sky="day" label={label} sun={{ x: 60, y: 46, r: 12 }}>
      {ids => (
        <>
          {/* street walls with doorways */}
          <path d="M0 40h120v170H0Z" fill="#e6d6bb" stroke={INK} strokeWidth="0.8" />
          <path d="M280 54h120v156H280Z" fill="#e0ceb0" stroke={INK} strokeWidth="0.8" />
          <path d="M30 210v-60a22 22 0 0 1 44 0v60" fill="#b99d78" stroke={INK} strokeWidth="0.8" />
          <path d="M310 210v-52a20 20 0 0 1 40 0v52" fill="#b99d78" stroke={INK} strokeWidth="0.8" />
          <rect x="0" y="40" width="120" height="170" fill={`url(#${ids.hatch})`} opacity="0.25" />
          <path d="M0 80h120M0 120h120M280 100h120M280 140h120" stroke={INK} strokeWidth="0.4" strokeOpacity="0.4" />
          <rect x="86" y="70" width="16" height="22" fill="#a68a66" stroke={INK} strokeWidth="0.6" />
          <rect x="300" y="78" width="14" height="20" fill="#a68a66" stroke={INK} strokeWidth="0.6" />
          {/* cobbles */}
          <rect x="0" y="210" width="400" height="50" fill={GROUND} />
          {Array.from({ length: 40 }, (_, i) => (
            <ellipse key={i} cx={(i * 47) % 400 + 6} cy={216 + ((i * 13) % 40)} rx="9" ry="3.5" fill="none" stroke={INK} strokeWidth="0.5" strokeOpacity="0.45" />
          ))}
          {/* the well */}
          <ellipse cx="200" cy="150" rx="66" ry="14" fill="#6d5640" stroke={INK} strokeWidth="1" />
          <path d="M134 150v52c0 8 30 14 66 14s66-6 66-14v-52c0 8-30 14-66 14s-66-6-66-14Z" fill={STONE_MID} stroke={INK} strokeWidth="1" />
          {[0, 1, 2].map(r => Array.from({ length: 6 }, (_, i) => (
            <path key={`${r}-${i}`} d={`M${140 + i * 22 + (r % 2) * 11} ${170 + r * 15}v13`} stroke={INK} strokeWidth="0.6" strokeOpacity="0.7" />
          )))}
          <path d="M134 168c20 9 112 9 132 0M134 183c20 9 112 9 132 0M134 198c20 9 112 9 132 0" fill="none" stroke={INK} strokeWidth="0.6" strokeOpacity="0.7" />
          <rect x="230" y="152" width="36" height="62" fill={`url(#${ids.hatch})`} opacity="0.6" />
          {/* windlass */}
          <rect x="146" y="78" width="8" height="78" fill="#8b6a45" stroke={INK} strokeWidth="0.8" />
          <rect x="246" y="78" width="8" height="78" fill="#8b6a45" stroke={INK} strokeWidth="0.8" />
          <rect x="140" y="80" width="120" height="8" rx="4" fill="#9b7a52" stroke={INK} strokeWidth="0.8" />
          <path d="M260 84h10v16h8" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <path d="M196 88v40" stroke={INK} strokeWidth="1" />
          {/* bucket */}
          <path d="M184 128h24l-3 22h-18Z" fill="#9b7a52" stroke={INK} strokeWidth="0.9" />
          <path d="M184 133h24M185 144h22" stroke={INK} strokeWidth="0.6" />
          <path d="M186 128c2-8 18-8 20 0" fill="none" stroke={INK} strokeWidth="0.8" />
          <Figure x={350} y={236} s={0.9} />
        </>
      )}
    </Plate>
  );
}

