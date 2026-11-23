import type { ComponentType } from "react";
import type { ImageRef } from "../lib/types.ts";
import { Plate } from "./Plate.tsx";
import { PowerStation, Pylons, WindCoast } from "./energy.tsx";
import { Avalanche, Pass, Survey } from "./mountain.tsx";
import { Ledger, Pump, StreetMap } from "./outbreak.tsx";
import { IceField, PolarCamp, Rations } from "./polar.tsx";
import { Aqueduct, AqueductSketch, Forum, Well } from "./water.tsx";

type Scene = ComponentType<{ label: string }>;

/** Built-in illustrations, by key. Challenges refer to these, or give an image URL instead. */
export const ILLUSTRATIONS: Record<string, { scene: Scene; name: string }> = {
  aqueduct: { scene: Aqueduct, name: "Aqueduct at dusk" },
  "aqueduct-sketch": { scene: AqueductSketch, name: "Aqueduct (pen sketch)" },
  forum: { scene: Forum, name: "Roman forum" },
  well: { scene: Well, name: "Town well" },
  ledger: { scene: Ledger, name: "Case register by lamplight" },
  pump: { scene: Pump, name: "Street water pump" },
  "street-map": { scene: StreetMap, name: "Town map with cases" },
  survey: { scene: Survey, name: "Surveyor's theodolite" },
  pass: { scene: Pass, name: "Mountain pass road" },
  avalanche: { scene: Avalanche, name: "Avalanche slope and snow shed" },
  "polar-camp": { scene: PolarCamp, name: "Polar camp" },
  "ice-field": { scene: IceField, name: "Pressure ridges on sea ice" },
  rations: { scene: Rations, name: "Expedition stores" },
  "wind-coast": { scene: WindCoast, name: "Wind turbines on the coast" },
  "power-station": { scene: PowerStation, name: "Coal power station" },
  pylons: { scene: Pylons, name: "Transmission pylons" },
};

/** A challenge picture: a built-in illustration, an image URL, or (with fallback) a quiet plate. */
export function Illustration({ image, className = "", fallback = false }: { image: ImageRef | null | undefined; className?: string; fallback?: boolean }) {
  if (image?.key && ILLUSTRATIONS[image.key]) {
    const Scene = ILLUSTRATIONS[image.key].scene;
    return <div className={className}><Scene label={image.alt} /></div>;
  }
  if (image?.src && /^https:\/\//.test(image.src)) {
    return (
      <figure className={className}>
        <img src={image.src} alt={image.alt} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        {image.credit && <figcaption className="sr-only">{image.credit}</figcaption>}
      </figure>
    );
  }
  if (fallback) {
    return (
      <div className={className} aria-hidden>
        <Plate sky="paper" label="">
          {() => (
            <g transform="translate(168 98)" opacity="0.55">
              <path d="M32 33c-6.6-3.2-8.4-9.4-5.2-15.3 1.5-2.8 3.7-5 4.3-8.7 2.9 2.6 4 5.6 3.4 8.6 1.4-.8 2.3-2.2 2.6-3.9 3.6 4.4 4.8 10.6 1.4 15.4-1.5 2.1-3.7 3.4-6.5 3.9Z" fill="#8a5d33" />
              <path d="M31 38.5C24.8 34.6 15.6 33.4 6 35v14.2c9.6-1.6 18.8-.4 25 3.5V38.5ZM33 38.5c6.2-3.9 15.4-5.1 25-3.5v14.2c-9.6-1.6-18.8-.4-25 3.5V38.5Z" fill="#8a5d33" />
            </g>
          )}
        </Plate>
      </div>
    );
  }
  return null;
}
