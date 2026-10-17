import { useState, useEffect, useRef } from "react";
import manifest from "@/data/crown-calibrations.json";
import { MASTER } from "@/lib/studio-store";
import {
  defaultPhotoGeometry,
  physicalPatch,
  physicalProjection,
  geometryFromBoundary,
  photoGeometryIssues,
  referenceMeasurement,
  patchFits,
  dimensionLabel,
  type PhotoGeometry,
} from "@/lib/patch-physical";
import {
  crownToSource,
  sourceToCrown,
  type Calibration,
  type Point,
  type PatchSize,
} from "@/lib/crown-geometry";
import { PatchFace } from "@/components/hat/patch-face";
import { hatDisplayImage } from "@/lib/hat-display-images";
import { limitedPhotoDetail } from "@/lib/hat-image-quality";
import { PublishingControls } from "./publishing-controls";
import { useOwnerDocuments } from "./use-owner-documents";
import { getOwnerHatPhotos, getMediaLibrary, addHatPhoto } from "@/lib/commerce/owner-api";
import type { MediaRow } from "@/lib/commerce/media.server";
export function CalibrationEditor() {
  const state = useOwnerDocuments<PhotoGeometry>("calibration");
  const [family, setFamily] = useState("112"),
    [photoId, setPhotoId] = useState(manifest.records.find((r) => r.modelId === "112")!.id);
  const [uploads, setUploads] = useState<Calibration[]>([]),
    [media, setMedia] = useState<MediaRow[]>([]),
    [mediaId, setMediaId] = useState(""),
    [provenance, setProvenance] = useState(""),
    [verified, setVerified] = useState(false),
    [registerError, setRegisterError] = useState(""),
    [registerBusy, setRegisterBusy] = useState(false);
  useEffect(() => {
    void Promise.all([getOwnerHatPhotos(), getMediaLibrary()])
      .then(([photos, files]) => {
        setUploads(photos);
        setMedia(files);
      })
      .catch((e) => setRegisterError(String(e)));
  }, []);
  const allPhotos = [...manifest.records, ...uploads] as Calibration[];
  const photo = allPhotos.find((r) => r.id === photoId) ?? (manifest.records[0] as Calibration);
  const [g, setG] = useState(() => defaultPhotoGeometry(photo)),
    [size, setSize] = useState<PatchSize>("medium"),
    [mode, setMode] = useState<"boundary" | "reference" | "anchor">("boundary"),
    [draw, setDraw] = useState(false),
    [drawPoints, setDrawPoints] = useState<Point[]>([]),
    [drawError, setDrawError] = useState("");
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{ kind: string; index: number } | null>(null);
  const row = state.rows.find((r) => r.key === photoId);
  useEffect(() => {
    setG(
      row?.draft
        ? { ...row.draft, projectionVersion: 2 }
        : {
            ...defaultPhotoGeometry(photo),
            ...(photo.id.startsWith("uploaded:") ? { polygon: [] } : {}),
          },
    );
    setDraw(false);
    setDrawPoints([]);
    setDrawError("");
  }, [photoId, row?.version, photo, row?.draft]);
  const width = 1000,
    height = (photo.sourceHeight / photo.sourceWidth) * width;
  const issues = photoGeometryIssues(photo, g);
  const measurement = referenceMeasurement(photo, g);
  const patch = !issues.length
    ? physicalProjection(physicalPatch("Rounded Rectangle", size), photo, g, {
        x: 0,
        y: 0,
        width,
        height,
      })
    : null;
  const fitsSize = (s: PatchSize) =>
    !issues.length &&
    patchFits(
      g.anchor,
      physicalProjection(physicalPatch("Rounded Rectangle", s), photo, g, {
        x: 0,
        y: 0,
        width,
        height,
      }),
      { width: g.bounds.width * width, height: g.bounds.height * height },
      g.polygon,
      g.rotation,
      g.skew,
      g.compression,
    );
  const measuredPublished = state.rows.filter((r) => r.published?.reference).length;
  const estimatedPublished = state.rows.filter((r) => r.published && !r.published.reference).length;
  const anchor = crownToSource(g.anchor, g.bounds);
  function sourcePoint(e: React.PointerEvent): Point {
    const b = svg.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
  }
  function move(e: React.PointerEvent) {
    if (!drag.current) return;
    moveMarker(sourcePoint(e), drag.current.kind, drag.current.index);
  }
  function moveMarker(point: Point, kind: string, index: number) {
    const p = { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) };
    if (kind === "polygon") {
      const c = sourceToCrown(p, g.bounds);
      setG((v) => ({
        ...v,
        polygon: v.polygon.map((q, i) =>
          i === index ? { x: Math.max(0, Math.min(1, c.x)), y: Math.max(0, Math.min(1, c.y)) } : q,
        ),
      }));
    }
    if (kind === "anchor") setG((v) => ({ ...v, anchor: sourceToCrown(p, v.bounds) }));
    if (kind === "reference")
      setG((v) => ({
        ...v,
        reference: v.reference ? { ...v.reference, [index === 0 ? "start" : "end"]: p } : null,
      }));
  }
  function marker(p: Point, index: number, kind: string) {
    return (
      <g
        key={kind + index}
        role="button"
        tabIndex={0}
        className="cc-calibration-marker"
        aria-label={
          kind === "anchor"
            ? "Default placement anchor"
            : `${kind === "polygon" ? "Boundary" : "Reference"} marker ${index + 1}`
        }
        aria-describedby="calibration-keyboard-help"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { kind, index };
        }}
        onKeyDown={(e) => {
          const arrows: Record<string, Point> = {
            ArrowLeft: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 },
            ArrowUp: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 },
          };
          const delta = arrows[e.key];
          if (!delta) return;
          e.preventDefault();
          const step = e.shiftKey ? 0.02 : 0.005;
          moveMarker({ x: p.x + delta.x * step, y: p.y + delta.y * step }, kind, index);
        }}
      >
        <circle cx={p.x} cy={p.y} r=".095" className="cc-calibration-hit" />
        <circle cx={p.x} cy={p.y} r=".014" className="cc-calibration-handle" />
      </g>
    );
  }
  return (
    <section className="cc-panel">
      <h2>Calibrate an exact product photograph</h2>
      <p>
        Outline the usable crown, then add a measured reference only when its physical length is
        known. Each photo keeps its own draft, image hash and published history.
      </p>
      <p className="cc-help" data-calibration-coverage="true">
        {manifest.records.length} exact catalog photos have visual crown bounds; those are not
        physical measurements. {measuredPublished} published owner reference
        {measuredPublished === 1 ? "" : "s"} · {estimatedPublished} published estimated calibration
        {estimatedPublished === 1 ? "" : "s"}. Physical accuracy requires a known length in this
        exact photograph, on the same crown plane as the patch.
      </p>
      {state.loading ? (
        <p role="status">Loading calibration drafts…</p>
      ) : (
        <>
          <div className="cc-two-col">
            <label className="cc-field">
              Richardson model
              <select
                aria-label="Richardson model"
                value={family}
                onChange={(e) => {
                  setFamily(e.target.value);
                  setPhotoId(manifest.records.find((r) => r.modelId === e.target.value)!.id);
                }}
              >
                {MASTER.models.map((m) => (
                  <option key={m.id}>{m.id}</option>
                ))}
              </select>
            </label>
            <label className="cc-field">
              Exact color photograph
              <select
                aria-label="Exact color photograph"
                value={photoId}
                onChange={(e) => setPhotoId(e.target.value)}
              >
                {allPhotos
                  .filter((r) => r.modelId === family)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {MASTER.models
                        .find((m) => m.id === family)
                        ?.colorways.find((c) => c.id === r.colorway)?.officialName ?? r.colorway}
                      {r.id.startsWith("uploaded:") ? " · Owner photo" : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <details className="cc-panel">
            <summary>Add a verified front photo for this exact colorway</summary>
            <p>
              Upload the photo in Photos & finished work first. Registration preserves an immutable
              derivative. New photos start with no usable boundary and become customer-visible only
              after their own calibration is published.
            </p>
            <label className="cc-field">
              Uploaded photograph
              <select
                aria-label="Uploaded photograph"
                value={mediaId}
                onChange={(e) => setMediaId(e.target.value)}
              >
                <option value="">Choose uploaded media</option>
                {media.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.alt || m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="cc-field">
              Source / verification note
              <textarea
                value={provenance}
                onChange={(e) => setProvenance(e.target.value)}
                placeholder="Where this exact model, color and front-view photo came from"
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
              />{" "}
              I verified this is Richardson {family},{" "}
              {
                MASTER.models
                  .find((m) => m.id === family)
                  ?.colorways.find((c) => c.id === photo.colorway)?.officialName
              }
              , front view. It is not another model or an invented angle.
            </label>
            <button
              className="cc-button secondary"
              disabled={!mediaId || !verified || registerBusy}
              onClick={async () => {
                setRegisterBusy(true);
                setRegisterError("");
                try {
                  const p = await addHatPhoto({
                    data: {
                      modelId: family,
                      colorway: photo.colorway,
                      mediaId,
                      verified,
                      provenance,
                    },
                  });
                  setUploads((v) => [p, ...v]);
                  setPhotoId(p.id);
                  setVerified(false);
                } catch (e) {
                  setRegisterError(e instanceof Error ? e.message : "Could not register photo.");
                } finally {
                  setRegisterBusy(false);
                }
              }}
            >
              Register private photo
            </button>
            {registerError && (
              <p role="alert" className="cc-error">
                {registerError}
              </p>
            )}
          </details>
          <p className="cc-help">
            Front · {photo.sourceWidth} × {photo.sourceHeight} · image {photo.sha256.slice(0, 16)} ·{" "}
            {g.reference
              ? "Owner reference entered — verify the real measurement before publishing"
              : "Estimated scale — 7.5-inch assumed crown width; no physical measurement supplied"}
          </p>
          {limitedPhotoDetail(photo.sourceWidth, photo.sourceHeight) && (
            <p role="status" className="cc-help">
              Limited-detail source photo ({photo.sourceWidth} × {photo.sourceHeight} pixels).
              Upload a clear, full-size front photo of this exact model and color, then calibrate
              and publish it. Enlarging this catalog crop cannot recover fabric detail.
            </p>
          )}
          {measurement && (
            <p className="cc-help">
              Reference span: {measurement.sourcePixels.toFixed(1)} source pixels. Rotation, shear
              and horizontal perspective are accounted for once. This remains a local planar
              approximation of a curved crown.
            </p>
          )}
          {row?.draft && !row.draft.projectionVersion && (
            <p className="cc-help">
              This draft uses corrected reference perspective when next published. Existing order
              snapshots retain their original projection.
            </p>
          )}
          {issues.length > 0 && (
            <div role="status" className="cc-error">
              <p>Complete this calibration before saving or publishing:</p>
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {drawError && (
            <p role="alert" className="cc-error">
              {drawError}
            </p>
          )}
          <div className="cc-calibration-layout">
            <div>
              <div
                className="cc-calibration-photo"
                style={{ aspectRatio: `${photo.sourceWidth}/${photo.sourceHeight}` }}
              >
                <img
                  src={hatDisplayImage(photo)?.imageUrl ?? photo.imageUrl}
                  alt={`Exact ${photo.modelId} calibration photograph`}
                />
                {patch && (
                  <div
                    className="cc-calibration-patch"
                    style={{
                      left: `${anchor.x * 100}%`,
                      top: `${anchor.y * 100}%`,
                      width: `${(patch.width / width) * 100}%`,
                      height: `${(patch.height / height) * 100}%`,
                      transform: `translate(-50%,-50%) rotate(${g.rotation}deg) skewX(${g.skew}deg) scaleX(${g.compression})`,
                    }}
                  >
                    <PatchFace material="buckskin" shape="Rounded Rectangle" text="REC MAMA MADE" />
                  </div>
                )}
                <svg
                  ref={svg}
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  aria-label="Calibration markers"
                  onPointerMove={move}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                  onPointerDown={(e) => {
                    if (draw && mode === "boundary") {
                      const source = sourcePoint(e);
                      setDrawPoints((points) => [...points, source]);
                      setDrawError("");
                    }
                  }}
                >
                  <polygon
                    points={(draw ? drawPoints : g.polygon.map((p) => crownToSource(p, g.bounds)))
                      .map((p) => {
                        return `${p.x},${p.y}`;
                      })
                      .join(" ")}
                    className="cc-crown-polygon"
                  />
                  {!draw &&
                    mode === "boundary" &&
                    g.polygon.map((p, i) => {
                      const s = crownToSource(p, g.bounds);
                      return marker(s, i, "polygon");
                    })}
                  {!draw && g.reference && (
                    <>
                      <line
                        x1={g.reference.start.x}
                        y1={g.reference.start.y}
                        x2={g.reference.end.x}
                        y2={g.reference.end.y}
                        className="cc-reference-line"
                      />
                      {mode === "reference" &&
                        [g.reference.start, g.reference.end].map((p, i) =>
                          marker(p, i, "reference"),
                        )}
                    </>
                  )}
                  {!draw && mode === "anchor" && marker(anchor, 0, "anchor")}
                </svg>
              </div>
              <p id="calibration-keyboard-help" className="cc-help">
                Drag a marker, or focus it and use arrow keys. Hold Shift for a larger adjustment.
              </p>
              <div className="cc-actions">
                {(["small", "medium", "large"] as PatchSize[]).map((s) => (
                  <button
                    key={s}
                    className={`cc-button ${size === s ? "" : "secondary"}`}
                    onClick={() => setSize(s)}
                  >
                    {s} · {dimensionLabel("Rounded Rectangle", s)} ·{" "}
                    {fitsSize(s) ? "fits" : "outside usable area"}
                  </button>
                ))}
              </div>
              {patch && !fitsSize(size) && (
                <p role="status" className="cc-error">
                  This rectangle extends beyond the usable area at the default anchor. Move the
                  anchor, review the measured reference, or test a smaller size.
                </p>
              )}
              <p className="cc-help">
                This is a preview of laser-cut leatherette. Final physical fit and the custom
                die-cut outline require the production proof.
              </p>
            </div>
            <div className="cc-form">
              <label className="cc-field">
                Edit markers
                <select
                  aria-label="Edit markers"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="boundary">Usable boundary</option>
                  <option value="reference">Reference endpoints</option>
                  <option value="anchor">Default placement anchor</option>
                </select>
              </label>
              <button
                className="cc-button secondary"
                onClick={() => {
                  setMode("boundary");
                  if (!draw) {
                    setDraw(true);
                    setDrawPoints([]);
                    setDrawError("");
                  } else {
                    try {
                      setG(geometryFromBoundary(drawPoints, g));
                      setDraw(false);
                      setDrawError("");
                    } catch (e) {
                      setDrawError(e instanceof Error ? e.message : "Review the usable boundary.");
                    }
                  }
                }}
              >
                {draw ? "Finish drawing boundary" : "Draw new boundary"}
              </button>
              {draw && (
                <>
                  <p className="cc-help">
                    Tap the corners in order around the usable crown. The new outline can extend
                    beyond the old bounds. {drawPoints.length} corner
                    {drawPoints.length === 1 ? "" : "s"} added.
                  </p>
                  <div className="cc-actions">
                    <button
                      className="cc-button secondary"
                      disabled={!drawPoints.length}
                      onClick={() => setDrawPoints((points) => points.slice(0, -1))}
                    >
                      Undo last corner
                    </button>
                    <button
                      className="cc-button secondary"
                      onClick={() => {
                        setDraw(false);
                        setDrawPoints([]);
                        setDrawError("");
                      }}
                    >
                      Cancel drawing
                    </button>
                  </div>
                </>
              )}
              <button
                className="cc-button secondary"
                onClick={() => {
                  setG({
                    ...defaultPhotoGeometry(photo),
                    ...(photo.id.startsWith("uploaded:") ? { polygon: [] } : {}),
                  });
                  setDraw(false);
                  setDrawPoints([]);
                  setDrawError("");
                }}
              >
                Reset to this photo’s visual bounds
              </button>
              <details>
                <summary>Advanced image coordinates</summary>
                <p className="cc-help">
                  The drawing tool sets these fractions of the source photograph. Use the markers
                  for ordinary calibration.
                </p>
                {(["x", "y", "width", "height"] as const).map((k) => (
                  <label key={k} className="cc-field">
                    Crown {k} (source fraction)
                    <input
                      aria-label={`Crown ${k} (source fraction)`}
                      type="number"
                      min="0"
                      max="1"
                      step=".001"
                      value={Number(g.bounds[k].toFixed(6))}
                      onChange={(e) =>
                        setG((v) => ({
                          ...v,
                          bounds: { ...v.bounds, [k]: Number(e.target.value) },
                        }))
                      }
                    />
                  </label>
                ))}
              </details>
              <label className="cc-field">
                Known reference length (inches)
                <input
                  aria-label="Known reference length (inches)"
                  type="number"
                  min=".25"
                  max="15"
                  step=".01"
                  value={g.reference?.inches ?? ""}
                  placeholder="Leave blank without a measured reference"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setG((v) => ({
                      ...v,
                      reference: e.target.value
                        ? {
                            start: v.reference?.start ?? { x: 0.35, y: 0.5 },
                            end: v.reference?.end ?? { x: 0.65, y: 0.5 },
                            inches: n,
                          }
                        : null,
                    }));
                    setMode("reference");
                  }}
                />
              </label>
              <p className="cc-help">
                Drag both reference markers onto the endpoints of the known length in this
                photograph, on the same plane and near the intended patch location. Do not use a
                ruler elsewhere in the scene or an assumed hat width. Start with a clear front
                photo; a single reference cannot recover exact curvature or depth.
              </p>
              {(["rotation", "skew", "compression"] as const).map((k) => (
                <label key={k} className="cc-field">
                  {k === "compression"
                    ? "Horizontal perspective"
                    : k === "skew"
                      ? "Crown shear (degrees)"
                      : "Crown rotation (degrees)"}
                  <input
                    aria-label={
                      k === "compression"
                        ? "Horizontal perspective"
                        : k === "skew"
                          ? "Crown shear (degrees)"
                          : "Crown rotation (degrees)"
                    }
                    type="number"
                    step={k === "compression" ? ".01" : "1"}
                    min={k === "compression" ? ".65" : "-20"}
                    max={k === "compression" ? "1" : "20"}
                    value={g[k]}
                    onChange={(e) => setG((v) => ({ ...v, [k]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
          </div>
          <fieldset disabled={draw || issues.length > 0} style={{ minWidth: 0 }}>
            <PublishingControls state={state} documentKey={photoId} body={g} />
          </fieldset>
        </>
      )}
    </section>
  );
}
