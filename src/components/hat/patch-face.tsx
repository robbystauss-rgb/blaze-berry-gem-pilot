import type { CSSProperties } from "react";
import { useState, useEffect } from "react";
import { getLeatherette } from "@/lib/catalog";
import { engravingPreview } from "./engraving-preview";
function patchClip(shape: string) {
  if (shape === "Circle") return "circle(50%)";
  if (shape === "Oval") return "ellipse(50% 50%)";
  if (shape === "Hexagon") return "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)";
  if (shape === "Shield") return "polygon(0 0,100% 0,100% 58%,50% 100%,0 58%)";
  return shape === "Rectangle" ? "inset(0)" : "inset(0 round 12%)";
}
/** This surface is exclusively a mockup. Production files always use original bytes. */
export function PatchFace({
  material,
  shape,
  text,
  artwork,
  style,
}: {
  material: string;
  shape: string;
  text: string;
  artwork?: string;
  style?: CSSProperties;
}) {
  const leather = getLeatherette(material);
  const [preview, setPreview] = useState<{ source: string; ink: string; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (artwork && !artwork.startsWith("data:application/pdf"))
      void engravingPreview(artwork, leather.ink)
        .then((url) => {
          if (active) setPreview({ source: artwork, ink: leather.ink, url });
        })
        .catch(() => {
          if (active) setPreview({ source: artwork, ink: leather.ink, url: artwork });
        });
    return () => {
      active = false;
    };
  }, [artwork, leather.ink]);
  const processed = !!preview && preview.source === artwork && preview.ink === leather.ink;
  return (
    <div
      className="physical-patch-face"
      data-patch-material="laser-cut"
      data-surface={leather.surface}
      style={{
        ...style,
        clipPath: patchClip(shape),
        backgroundColor: leather.hex,
        backgroundImage: leather.texture ? `url(${leather.texture})` : undefined,
        color: leather.ink,
      }}
    >
      <div className="physical-patch-shading" />
      {artwork && !artwork.startsWith("data:application/pdf") ? (
        <img
          src={processed ? preview.url : artwork}
          data-engraving-ready={processed ? "true" : "false"}
          alt=""
          draggable={false}
          className="physical-patch-art"
          style={processed ? { filter: "none", mixBlendMode: "normal" } : undefined}
        />
      ) : (
        <span className="physical-patch-text">
          {artwork ? "PDF artwork" : text.trim() || "Your patch"}
        </span>
      )}
    </div>
  );
}
