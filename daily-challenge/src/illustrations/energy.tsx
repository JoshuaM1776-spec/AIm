import { GROUND, INK, Plate, STONE, STONE_MID } from "./Plate.tsx";

function Turbine({ x, y, h, angle = 0 }: { x: number; y: number; h: number; angle?: number }) {
  const blade = h * 0.42;
  return (
    <g>
      <path d={`M${x - h * 0.025} ${y}L${x - h * 0.01} ${y - h}h${h * 0.02}L${x + h * 0.025} ${y}Z`} fill="#f6f3ec" stroke={INK} strokeWidth="0.8" />
      <g transform={`translate(${x} ${y - h}) rotate(${angle})`}>
        {[0, 120, 240].map(a => (
          <path key={a} transform={`rotate(${a})`} d={`M0 0c${blade * 0.05} ${-blade * 0.3} ${blade * 0.05} ${-blade * 0.8} 0 ${-blade}c${-blade * 0.08} ${blade * 0.3} ${-blade * 0.1} ${blade * 0.7} 0 ${blade}Z`}
            fill="#f8f6f0" stroke={INK} strokeWidth="0.7" />
        ))}
        <circle r={h * 0.025} fill="#e7e3d8" stroke={INK} strokeWidth="0.7" />
      </g>
    </g>
  );
}

export function WindCoast({ label }: { label: string }) {
  return (
    <Plate sky="day" label={label} sun={{ x: 330, y: 60, r: 13 }}>
      {ids => (
        <>
          <path d="M0 170h400V260H0Z" fill="#cbc8b7" />
          <path d="M20 182h80M150 190h120M300 180h70M60 204h120M240 214h120" stroke={INK} strokeWidth="0.6" strokeOpacity="0.35" />
          {/* offshore turbines */}
          <Turbine x={250} y={170} h={56} angle={20} />
          <Turbine x={300} y={170} h={48} angle={70} />
          <Turbine x={346} y={170} h={40} angle={40} />
          <Turbine x={384} y={170} h={32} angle={95} />
          {/* headland and cliffs */}
          <path d="M0 120c40-6 80 0 120 10s60 20 80 40l-10 20c-20 8-40 30-60 70H0Z" fill="#cdb894" stroke={INK} strokeWidth="1" />
          <path d="M120 130c24 10 46 22 70 50l-10 20c-14 6-30 20-48 60" fill="none" stroke={INK} strokeWidth="0.6" />
          <rect x="0" y="120" width="200" height="140" fill={`url(#${ids.hatch})`} opacity="0.2" />
          <path d="M0 122c30-4 60-2 100 4" stroke="#8f8159" strokeWidth="5" fill="none" />
          {/* onshore turbines */}
          <Turbine x={40} y={124} h={84} angle={10} />
          <Turbine x={104} y={128} h={70} angle={50} />
        </>
      )}
    </Plate>
  );
}

export function PowerStation({ label }: { label: string }) {
  return (
    <Plate sky="overcast" label={label}>
      {ids => (
        <>
          {/* smoke */}
          <path d="M120 40c20-14 50-10 70-20s60-6 80 6c-30 4-50 14-80 16s-50-2-70-2Z" fill="#bdb6a8" opacity="0.5" />
          <path d="M150 50c30-8 60-2 90-10" stroke="#a79f90" strokeWidth="6" strokeLinecap="round" opacity="0.4" fill="none" />
          {/* cooling towers */}
          {[[262, 92], [320, 100]].map(([x, top], i) => (
            <g key={i}>
              <path d={`M${x} ${top}c-4 34-8 60-18 ${178 - top}h76c-10 ${-(178 - top) + 60}-14 ${-(178 - top) + 26}-18 ${-(178 - top)}Z`} fill={STONE} stroke={INK} strokeWidth="1" />
              <path d={`M${x + 22} ${top}c4 34 8 60 18 ${178 - top}h20c-10 ${-(178 - top) + 60}-14 ${-(178 - top) + 26}-18 ${-(178 - top)}Z`} fill={`url(#${ids.hatch})`} opacity="0.7" />
              <ellipse cx={x + 20} cy={top} rx="20" ry="4" fill="#e2d8c6" stroke={INK} strokeWidth="0.9" />
              <path d={`M${x + 6} ${top - 6}c4-14 24-14 28-4`} stroke="#cfc8b9" strokeWidth="8" strokeLinecap="round" fill="none" opacity="0.7" />
            </g>
          ))}
          {/* chimneys */}
          {[132, 160].map(x => (
            <g key={x}>
              <path d={`M${x} 178l4-130h8l4 130Z`} fill={STONE_MID} stroke={INK} strokeWidth="0.9" />
              <path d={`M${x + 3} 64h14M${x + 2} 80h16`} stroke="#8a3a24" strokeWidth="2" />
            </g>
          ))}
          {/* boiler house */}
          <rect x="40" y="110" width="180" height="68" fill="#d5bf9c" stroke={INK} strokeWidth="1" />
          <path d="M40 110l20-14h140l20 14" fill="#c7af89" stroke={INK} strokeWidth="1" />
          {Array.from({ length: 8 }, (_, i) => <rect key={i} x={52 + i * 20} y="122" width="10" height="26" fill="#7a6650" stroke={INK} strokeWidth="0.6" />)}
          <rect x="40" y="110" width="180" height="68" fill={`url(#${ids.hatch})`} opacity="0.25" />
          {/* conveyor and coal heap */}
          <path d="M20 178L60 140h18L38 178Z" fill="#9c8a6c" stroke={INK} strokeWidth="0.8" />
          <path d="M0 178c10-16 24-24 44-24" fill="none" stroke={INK} />
          <path d="M0 178c8-12 20-18 32-18 8 6 14 12 18 18Z" fill="#4c4038" stroke={INK} strokeWidth="0.8" />
          {/* shore and sea */}
          <path d="M0 178h400v14H0Z" fill={GROUND} stroke={INK} strokeWidth="0.8" />
          <path d="M0 192h400V260H0Z" fill="#c4c3b4" />
          <path d="M20 206h70M130 214h90M260 204h80M60 232h110M220 240h120" stroke={INK} strokeWidth="0.6" strokeOpacity="0.35" />
        </>
      )}
    </Plate>
  );
}

function Pylon({ x, y, h }: { x: number; y: number; h: number }) {
  const w = h * 0.32;
  return (
    <g stroke={INK} strokeWidth="0.8" fill="none">
      <path d={`M${x - w / 2} ${y}L${x - w * 0.08} ${y - h}M${x + w / 2} ${y}L${x + w * 0.08} ${y - h}`} />
      {Array.from({ length: 6 }, (_, i) => {
        const t1 = i / 6;
        const t2 = (i + 1) / 6;
        const xa = (t: number) => x - w / 2 + (w / 2 - w * 0.08) * t;
        const xb = (t: number) => x + w / 2 - (w / 2 - w * 0.08) * t;
        return <path key={i} d={`M${xa(t1)} ${y - h * t1}L${xb(t2)} ${y - h * t2}M${xb(t1)} ${y - h * t1}L${xa(t2)} ${y - h * t2}`} strokeWidth="0.5" />;
      })}
      <path d={`M${x - w * 0.9} ${y - h * 0.72}h${w * 1.8}M${x - w * 0.7} ${y - h * 0.9}h${w * 1.4}`} strokeWidth="1" />
    </g>
  );
}

export function Pylons({ label }: { label: string }) {
  const towers = [{ x: 70, y: 220, h: 150 }, { x: 210, y: 196, h: 96 }, { x: 300, y: 182, h: 62 }, { x: 360, y: 174, h: 40 }];
  const arm = (t: typeof towers[number], k: number) => ({ x: t.x + (k - 1) * t.h * 0.29, y: t.y - t.h * (k === 1 ? 0.9 : 0.72) });
  return (
    <Plate sky="dusk" label={label} sun={{ x: 320, y: 110, r: 14 }}>
      {ids => (
        <>
          <path d="M0 176c80-10 200-12 400-4V260H0Z" fill="#dcc6a2" />
          <path d="M0 200c100-14 220-12 400-6V260H0Z" fill="#d2ba92" stroke={INK} strokeWidth="0.5" />
          <rect x="0" y="176" width="400" height="84" fill={`url(#${ids.hatch})`} opacity="0.12" />
          {/* a small town on the horizon */}
          {[250, 262, 276, 288, 300, 314].map((x, i) => <rect key={x} x={x} y={170 - (i % 3) * 4} width="10" height={8 + (i % 3) * 4} fill={STONE_MID} stroke={INK} strokeWidth="0.5" />)}
          {/* field lines */}
          <path d="M0 230c80-6 160-4 240 2M40 248c80-8 200-6 360-2M120 214c60-4 140-4 240 0" stroke={INK} strokeWidth="0.5" strokeOpacity="0.4" fill="none" />
          {towers.map((t, i) => <Pylon key={i} {...t} />)}
          {/* sagging wires between arms */}
          {[0, 1, 2].map(k => towers.slice(0, -1).map((t, i) => {
            const a = arm(t, k);
            const b = arm(towers[i + 1], k);
            const mx = (a.x + b.x) / 2;
            const my = Math.max(a.y, b.y) + 14 - i * 3;
            return <path key={`${k}-${i}`} d={`M${a.x} ${a.y}Q${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke={INK} strokeWidth="0.6" />;
          }))}
          {[0, 1, 2].map(k => {
            const a = arm(towers[0], k);
            return <path key={k} d={`M${a.x} ${a.y}Q${a.x - 40} ${a.y + 20} -10 ${a.y + 10}`} fill="none" stroke={INK} strokeWidth="0.6" />;
          })}
        </>
      )}
    </Plate>
  );
}
