import { useEffect, useState } from "react";
import type { Json } from "@/lib/commerce/types";
import type { Calibration, Dimensions, Point } from "@/lib/crown-geometry";
import { crownToSource } from "@/lib/crown-geometry";
import { physicalProjection, type PhotoGeometry } from "@/lib/patch-physical";
import { getBearerToken } from "@/lib/auth/client";
import { getLeatherette } from "@/lib/catalog";
import { PatchFace } from "./patch-face";
import { engravingPreview } from "./engraving-preview";
type Snapshot = {
  version: 3;
  photo: Calibration;
  geometry: PhotoGeometry;
  physicalInches: Dimensions;
  anchor: Point;
  scaleStatus: string;
};
export function SavedHatProof({
  specifications: s,
  itemId,
  hasArtwork,
}: {
  specifications: Record<string, Json>;
  itemId: string;
  hasArtwork: boolean;
}) {
  const snapshot = s.preview as unknown as Snapshot | undefined;
  const [artwork, setArtwork] = useState<string>(),
    [error, setError] = useState("");
  const [artworkReady, setArtworkReady] = useState(!hasArtwork);
  useEffect(() => {
    let alive = true,
      url = "";
    if (hasArtwork) {
      setArtworkReady(false);
      const token = getBearerToken();
      void fetch("/api/artwork/" + itemId, {
        headers: token ? { Authorization: "Bearer " + token } : {},
      })
        .then((r) => {
          if (!r.ok) throw Error("Original artwork preview could not load.");
          return r.blob();
        })
        .then((b) => {
          if (b.type.startsWith("image/")) {
            url = URL.createObjectURL(b);
            if (alive) setArtwork(url);
          }
          if (alive) setArtworkReady(true);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [itemId, hasArtwork]);
  if (!snapshot?.photo || snapshot.version !== 3) return null;
  const { photo, geometry: g, physicalInches: physical, anchor } = snapshot;
  const pos = crownToSource(anchor, g.bounds),
    patch = physicalProjection(physical, photo, g, {
      x: 0,
      y: 0,
      width: 100,
      height: (100 * photo.sourceHeight) / photo.sourceWidth,
    });
  async function download() {
    setError("");
    try {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(Error("Mockup image could not load."));
          i.src = src;
        });
      const image = await load(photo.imageUrl),
        leather = getLeatherette(String(s.leatherette)),
        texture = await load(leather.texture);
      const art = artwork ? await load(await engravingPreview(artwork, leather.ink)) : null;
      const canvas = document.createElement("canvas");
      canvas.width = photo.sourceWidth;
      canvas.height = photo.sourceHeight;
      const c = canvas.getContext("2d")!;
      c.drawImage(image, 0, 0, canvas.width, canvas.height);
      const d = physicalProjection(physical, photo, g, {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      });
      c.translate(pos.x * canvas.width, pos.y * canvas.height);
      c.rotate((g.rotation * Math.PI) / 180);
      c.transform(1, 0, Math.tan((g.skew * Math.PI) / 180), 1, 0, 0);
      c.scale(g.compression, 1);
      const w = d.width,
        h = d.height;
      c.beginPath();
      if (s.patchShape === "Circle" || s.patchShape === "Oval")
        c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      else if (s.patchShape === "Hexagon" || s.patchShape === "Shield") {
        const points =
          s.patchShape === "Hexagon"
            ? [
                [0.25, 0],
                [0.75, 0],
                [1, 0.5],
                [0.75, 1],
                [0.25, 1],
                [0, 0.5],
              ]
            : [
                [0, 0],
                [1, 0],
                [1, 0.58],
                [0.5, 1],
                [0, 0.58],
              ];
        points.forEach(([x, y], i) => {
          if (i) c.lineTo((x - 0.5) * w, (y - 0.5) * h);
          else c.moveTo((x - 0.5) * w, (y - 0.5) * h);
        });
        c.closePath();
      } else
        c.roundRect(-w / 2, -h / 2, w, h, s.patchShape === "Rectangle" ? 0 : Math.min(w, h) * 0.12);
      c.fillStyle = leather.hex;
      c.shadowColor = "rgba(24,18,12,.55)";
      c.shadowBlur = 1.5;
      c.shadowOffsetY = 1.5;
      c.fill();
      c.shadowColor = "transparent";
      c.clip();
      const scale = Math.max(w / texture.width, h / texture.height);
      c.drawImage(
        texture,
        (-texture.width * scale) / 2,
        (-texture.height * scale) / 2,
        texture.width * scale,
        texture.height * scale,
      );
      if (art) {
        const factor = Math.min((w * 0.8) / art.width, (h * 0.78) / art.height);
        c.globalCompositeOperation = "source-over";
        c.drawImage(
          art,
          (-art.width * factor) / 2,
          (-art.height * factor) / 2,
          art.width * factor,
          art.height * factor,
        );
        c.filter = "none";
        c.globalCompositeOperation = "source-over";
      } else {
        c.fillStyle = leather.ink;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = `600 ${Math.min(24, w * 0.12)}px sans-serif`;
        c.fillText(String(s.patchText || "PDF artwork"), 0, 0, w * 0.82);
      }
      const light = c.createLinearGradient(-w / 2, 0, w / 2, 0);
      light.addColorStop(0, "rgba(25,17,10,.18)");
      light.addColorStop(0.2, "transparent");
      light.addColorStop(0.8, "transparent");
      light.addColorStop(1, "rgba(25,17,10,.22)");
      c.fillStyle = light;
      c.fillRect(-w / 2, -h / 2, w, h);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "REC-preview-only-" + itemId + ".png";
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export mockup.");
    }
  }
  return (
    <div className="cc-order-proof">
      <h4>Saved customer mockup</h4>
      <div
        className="saved-hat-proof"
        style={{ aspectRatio: `${photo.sourceWidth}/${photo.sourceHeight}` }}
      >
        <img src={photo.imageUrl} alt="Exact ordered hat photograph" />
        <div
          className="saved-proof-patch"
          style={{
            left: `${pos.x * 100}%`,
            top: `${pos.y * 100}%`,
            width: `${patch.width}%`,
            height: `${patch.height / (photo.sourceHeight / photo.sourceWidth)}%`,
          }}
        >
          <div
            className="physical-patch-mounted"
            style={{
              transform: `rotate(${g.rotation}deg) skewX(${g.skew}deg) scaleX(${g.compression})`,
            }}
          >
            <PatchFace
              material={String(s.leatherette)}
              shape={String(s.patchShape)}
              text={String(s.patchText ?? "")}
              artwork={artwork}
            />
          </div>
        </div>
      </div>
      <p>
        {physical.width}″ × {physical.height}″ · Crown position {anchor.x.toFixed(3)},{" "}
        {anchor.y.toFixed(3)} ·{" "}
        {snapshot.scaleStatus === "estimated"
          ? "Estimated photo scale"
          : "Owner reference calibration"}
      </p>
      <p className="cc-help">
        Preview effects are separate from the unmodified production artwork. This frozen photo and
        calibration remain with the order.
      </p>
      <button
        className="cc-button secondary cc-no-print"
        disabled={!artworkReady}
        onClick={() => void download()}
      >
        {artworkReady ? "Download composite mockup" : "Loading original for mockup…"}
      </button>
      {error && (
        <p role="alert" className="cc-error">
          {error}
        </p>
      )}
    </div>
  );
}
