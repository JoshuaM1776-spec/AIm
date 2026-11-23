import type { ComponentType } from "react";
import type { ImageRef } from "../lib/types.ts";
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

/** A challenge picture: a built-in illustration, an image URL, or a quiet placeholder. */
export function Illustration({ image, className = "" }: { image: ImageRef | null | undefined; className?: string }) {
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
  return null;
}
