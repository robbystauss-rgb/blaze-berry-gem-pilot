import { Link } from "@tanstack/react-router";
import { stageThumb } from "@/lib/stage-photos";
import type { FamilyId } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export function ColorCard({
  family,
  name,
  category,
}: {
  family: FamilyId;
  name: string;
  category?: string;
}) {
  const photo = stageThumb(family, name);
  return (
    <Link
      to="/order"
      search={{ family, color: name }}
      className="group block overflow-hidden rounded-2xl bg-white p-3 shadow-stage ring-1 ring-stage-line transition-transform duration-150 hover:-translate-y-0.5"
    >
      {photo ? (
        <img src={photo} alt={`${family} ${name}`} className="aspect-[4/3] w-full rounded-xl bg-white object-contain" />
      ) : (
        <div className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-stage text-center text-xs text-stage-muted">
          Verified product photo unavailable
        </div>
      )}
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {category && (
            <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
              {category}
            </p>
          )}
          <p className="truncate font-medium text-stage-ink">{name}</p>
        </div>
      </div>
    </Link>
  );
}

export function LeatherSwatch({
  name,
  texture,
  hex,
  selected,
  onSelect,
}: {
  name: string;
  texture: string;
  hex: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "overflow-hidden rounded-2xl text-left ring-1 ring-border transition-[transform,box-shadow] duration-150",
        selected ? "ring-2 ring-primary" : "hover:ring-primary/50",
      )}
    >
      <span
        className="block aspect-square w-full bg-cover bg-center"
        style={{ backgroundColor: hex, backgroundImage: `url(${texture})` }}
      />
      <span className="block px-2.5 py-2 text-sm font-medium text-stage-ink">{name}</span>
    </button>
  );
}
