import { Figure, GROUND, INK, INK_SOFT, Plate, STONE, STONE_MID } from "./Plate.tsx";

export function Ledger({ label }: { label: string }) {
  return (
    <Plate sky="night" label={label}>
      {ids => (
        <>
          {/* lamp glow */}
          <circle cx="300" cy="96" r="150" fill={`url(#${ids.glow})`} opacity="0.8" />
          {/* desk */}
          <path d="M0 170h400v90H0Z" fill="#8b6a48" />
          <path d="M0 170h400" stroke={INK} strokeWidth="1.2" />
          <rect x="0" y="170" width="400" height="90" fill={`url(#${ids.hatch})`} opacity="0.5" />
          {/* open register */}
          <path d="M70 200l120-22 10 4 10-4 120 22-6 34-124-18-124 18Z" fill="#cdb48e" stroke={INK} strokeWidth="0.8" />
          <path d="M76 196l124-20v40L80 234Z" fill="#f2e7d2" stroke={INK} strokeWidth="0.9" />
          <path d="M324 196l-124-20v40l120 18Z" fill="#f5ecdb" stroke={INK} strokeWidth="0.9" />
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i}>
              <path d={`M${86 + i * 0} ${200 + i * 4.6}l${106} ${-17}`} stroke={INK} strokeWidth="0.4" strokeOpacity="0.5" />
              <path d={`M${208} ${183 + i * 4.6}l${106} ${17}`} stroke={INK} strokeWidth="0.4" strokeOpacity="0.5" />
            </g>
          ))}
          {/* tallies on the right-hand page */}
          {Array.from({ length: 5 }, (_, r) => (
            <g key={r} stroke={INK} strokeWidth="0.9">
              {Array.from({ length: 4 }, (_, i) => <path key={i} d={`M${244 + i * 4 + r * 3} ${190 + r * 5}v-5`} />)}
              <path d={`M${242 + r * 3} ${190 + r * 5}l16 -4`} />
            </g>
          ))}
          {/* script on the left page */}
          <path d="M96 202c8-3 12 2 20-1s10 2 18-1 12 1 20-2M96 212c10-3 14 2 22-1s12 2 20-1M96 222c8-2 14 1 20-1s14 1 22-2" fill="none" stroke={INK} strokeWidth="0.7" strokeOpacity="0.8" />
          {/* inkpot and quill */}
          <path d="M342 222c-2-10 2-14 14-14s16 4 14 14c-2 6-26 6-28 0Z" fill="#3c2a1c" stroke={INK} strokeWidth="0.8" />
          <rect x="350" y="200" width="12" height="9" fill="#3c2a1c" />
          <path d="M356 204c10-40 34-70 40-84-12 18-30 48-38 84Z" fill="#efe3cc" stroke={INK} strokeWidth="0.8" />
          <path d="M356 204l38-82" stroke={INK} strokeWidth="0.5" />
          {/* oil lamp */}
          <path d="M282 170c-2-10 4-16 18-16s20 6 18 16Z" fill="#a9895f" stroke={INK} strokeWidth="0.9" />
          <path d="M290 154c-4-14 0-30 10-40 10 10 14 26 10 40Z" fill="#f6ead2" fillOpacity="0.55" stroke={INK} strokeWidth="0.9" />
          <path d="M300 132c-4-6-2-12 0-16 3 4 4 10 0 16Z" fill="#f2b85e" />
          <rect x="294" y="110" width="12" height="5" fill="#a9895f" stroke={INK} strokeWidth="0.7" />
          <text x="40" y="60" fontFamily="EB Garamond Variable, serif" fontStyle="italic" fontSize="15" fill="#e9d8bc" opacity="0.7">Register of cases</text>
          <path d="M40 66h120" stroke="#e9d8bc" strokeOpacity="0.4" />
        </>
      )}
    </Plate>
  );
}

export function Pump({ label }: { label: string }) {
  return (
    <Plate sky="overcast" label={label}>
      {ids => (
        <>
          {/* brick terraces */}
          <path d="M0 50h170v160H0Z" fill="#d9bfa0" stroke={INK} strokeWidth="0.8" />
          <path d="M230 70h170v140H230Z" fill="#d2b797" stroke={INK} strokeWidth="0.8" />
          {Array.from({ length: 16 }, (_, i) => <path key={`a${i}`} d={`M0 ${58 + i * 9.6}h170`} stroke={INK} strokeWidth="0.35" strokeOpacity="0.45" />)}
          {Array.from({ length: 14 }, (_, i) => <path key={`b${i}`} d={`M230 ${78 + i * 9.6}h170`} stroke={INK} strokeWidth="0.35" strokeOpacity="0.45" />)}
          {[20, 70, 120].map(x => <rect key={x} x={x} y="80" width="26" height="36" fill="#6e5844" stroke={INK} strokeWidth="0.8" />)}
          {[250, 300, 350].map(x => <rect key={x} x={x} y="96" width="26" height="34" fill="#6e5844" stroke={INK} strokeWidth="0.8" />)}
          <rect x="70" y="150" width="30" height="60" fill="#5b4636" stroke={INK} strokeWidth="0.8" />
          {/* street */}
          <rect x="0" y="210" width="400" height="50" fill={GROUND} />
          {Array.from({ length: 36 }, (_, i) => (
            <rect key={i} x={(i * 37) % 400} y={214 + ((i * 11) % 40)} width="14" height="6" rx="2" fill="none" stroke={INK} strokeWidth="0.45" strokeOpacity="0.5" />
          ))}
          {/* the pump */}
          <rect x="186" y="78" width="28" height="132" fill="#5a4a3c" stroke={INK} strokeWidth="1" />
          {[192, 198, 204].map(x => <path key={x} d={`M${x} 84v120`} stroke="#8a7562" strokeWidth="1.2" />)}
          <path d="M180 78h40l-6-14h-28Z" fill="#4a3c30" stroke={INK} strokeWidth="1" />
          <circle cx="200" cy="58" r="7" fill="#4a3c30" stroke={INK} strokeWidth="1" />
          <rect x="182" y="200" width="36" height="12" fill="#4a3c30" stroke={INK} strokeWidth="1" />
          {/* handle */}
          <path d="M214 96c20-4 34-18 44-36" fill="none" stroke="#3f3328" strokeWidth="5" strokeLinecap="round" />
          <circle cx="214" cy="96" r="4" fill="#3f3328" />
          {/* spout and trough */}
          <path d="M186 132h-22v8h14v6h8Z" fill="#4a3c30" stroke={INK} strokeWidth="0.9" />
          <path d="M150 196h46v14h-46Z" fill={STONE_MID} stroke={INK} strokeWidth="0.9" />
          <path d="M172 146v48" stroke="#9fb0b0" strokeWidth="2" strokeOpacity="0.7" />
          <rect x="186" y="78" width="10" height="132" fill={`url(#${ids.hatch})`} opacity="0.6" />
          <Figure x={290} y={238} s={1} />
          <Figure x={120} y={240} s={0.95} />
          <path d="M282 206h-8l-2 10h12Z" fill={STONE} stroke={INK} strokeWidth="0.6" />
        </>
      )}
    </Plate>
  );
}

export function StreetMap({ label }: { label: string }) {
  // A fictional town plan, with cases marked as small bars.
  const cases: [number, number][] = [
    [192, 118], [198, 112], [204, 124], [186, 130], [210, 108], [214, 130], [196, 138], [180, 112], [220, 120], [206, 140],
    [188, 100], [226, 136], [174, 124], [200, 96], [216, 98], [230, 112], [168, 138], [240, 128], [154, 108], [250, 150], [120, 180], [300, 90],
  ];
  return (
    <Plate sky="paper" label={label}>
      {ids => (
        <>
          <rect x="16" y="14" width="368" height="232" fill="#f1e6d1" stroke={INK} strokeWidth="1" />
          <rect x="22" y="20" width="356" height="220" fill="none" stroke={INK} strokeWidth="0.5" />
          {/* river */}
          <path d="M22 200c60-14 100 10 160 0s120-40 196-30v32c-70-8-120 26-196 34S70 230 22 236Z" fill="#cfd2c4" stroke={INK} strokeWidth="0.8" />
          <rect x="22" y="160" width="356" height="80" fill={`url(#${ids.hatch})`} opacity="0.12" />
          {/* streets */}
          {[60, 110, 160, 210, 260, 310].map(x => <path key={x} d={`M${x} 26v${x < 200 ? 160 : 140}`} stroke={INK} strokeWidth="0.8" strokeOpacity="0.55" />)}
          {[50, 90, 130, 165].map(y => <path key={y} d={`M26 ${y}h348`} stroke={INK} strokeWidth="0.8" strokeOpacity="0.55" />)}
          <path d="M26 26L374 160" stroke={INK} strokeWidth="1.4" strokeOpacity="0.5" />
          {/* blocks */}
          {Array.from({ length: 18 }, (_, i) => {
            const x = 64 + (i % 6) * 50;
            const y = 54 + Math.floor(i / 6) * 40;
            return <rect key={i} x={x} y={y} width="42" height="32" fill={STONE} fillOpacity="0.55" />;
          })}
          {/* cases */}
          {cases.map(([x, y], i) => <rect key={i} x={x} y={y} width="5" height="3" fill={INK} />)}
          {/* the pump */}
          <circle cx="202" cy="120" r="6" fill="none" stroke="#8a3a24" strokeWidth="1.6" />
          <path d="M196 120h12M202 114v12" stroke="#8a3a24" strokeWidth="1.2" />
          {/* workhouse */}
          <rect x="114" y="94" width="42" height="32" fill="none" stroke={INK} strokeWidth="1.2" strokeDasharray="3 2" />
          <text x="135" y="113" textAnchor="middle" fontFamily="EB Garamond Variable, serif" fontSize="8" fill={INK_SOFT}>Workhouse</text>
          {/* compass */}
          <g transform="translate(346 56)">
            <circle r="16" fill="none" stroke={INK} strokeWidth="0.6" />
            <path d="M0-14l4 14-4 14-4-14Z" fill={INK} opacity="0.7" />
            <text y="-18" textAnchor="middle" fontSize="8" fontFamily="EB Garamond Variable, serif" fill={INK}>N</text>
          </g>
          <text x="34" y="232" fontFamily="EB Garamond Variable, serif" fontStyle="italic" fontSize="12" fill={INK_SOFT}>Cases by dwelling, first ten days</text>
        </>
      )}
    </Plate>
  );
}
