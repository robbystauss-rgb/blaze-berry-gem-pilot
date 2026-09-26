import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
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
      className="premium-card group block overflow-hidden rounded-[26px] bg-white"
    >
      <div className="product-card-stage grid aspect-[4/3] w-full place-items-center overflow-hidden">
        {photo ? (
          <img
            src={photo}
            alt={`${family} ${name}`}
            className="relative z-10 h-[86%] w-[88%] object-contain transition-transform duration-300 ease-out group-hover:scale-[1.035]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center px-5 text-center text-xs text-stage-muted">
            Verified product photo unavailable
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          {category && (
            <p className="text-[0.62rem] font-extrabold tracking-[0.15em] text-primary uppercase">
              {category}
            </p>
          )}
          <p className="mt-1 truncate font-display text-[1.02rem] font-semibold tracking-[-0.025em] text-stage-ink">{name}</p>
        </div>
        <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-subtle transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <span aria-hidden="true">→</span>
        </span>
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
        "group overflow-hidden rounded-[22px] bg-white text-left shadow-[0_10px_28px_rgba(45,38,30,0.05)] ring-1 transition-[transform,box-shadow] duration-200",
        selected ? "ring-2 ring-primary" : "ring-border hover:-translate-y-0.5 hover:ring-primary/40",
      )}
    >
      <span
        className="relative block aspect-square w-full overflow-hidden bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.025]"
        style={{ backgroundColor: hex, backgroundImage: `url(${texture})` }}
      />
      <span className="flex items-center justify-between gap-2 px-3 py-3 text-sm font-semibold text-stage-ink">
        <span>{name}</span>
        {selected && <Check className="size-4 shrink-0 text-primary" />}
      </span>
    </button>
  );
}
