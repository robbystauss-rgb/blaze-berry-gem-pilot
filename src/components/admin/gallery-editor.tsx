import { useEffect, useRef, useState } from "react";
import { getMediaLibrary, saveMedia } from "@/lib/commerce/owner-api";
import type { MediaRow } from "@/lib/commerce/media.server";
import { gallerySchema } from "@/lib/commerce/owner-schemas";
import type { z } from "zod";
import { FAMILY_ORDER } from "@/lib/catalog";
import { PublishingControls } from "./publishing-controls";
import { useOwnerDocuments } from "./use-owner-documents";
import { MAX_NEW_UPLOAD_BYTES } from "@/lib/upload-limits";
type Project = z.infer<typeof gallerySchema>;
const blank = (): Project => ({
  title: "",
  description: "",
  category: "Hats",
  tags: [],
  mediaIds: [],
  coverId: "",
  featured: false,
  consent: false,
  archived: false,
  family: "",
});
export function GalleryEditor() {
  const state = useOwnerDocuments<Project>("gallery");
  const [media, setMedia] = useState<MediaRow[]>([]),
    [selected, setSelected] = useState<MediaRow | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState(""),
    [status, setStatus] = useState("");
  const [projectId, setProjectId] = useState(() => crypto.randomUUID() as string),
    [project, setProject] = useState<Project>(blank);
  const [rotation, setRotation] = useState(0),
    [crop, setCrop] = useState({ left: 0, top: 0, width: 100, height: 100 }),
    [cropEnabled, setCropEnabled] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const row = state.rows.find((r) => r.key === projectId);
  useEffect(() => {
    setProject(row?.draft ?? blank());
  }, [projectId, row?.version, row?.draft]);
  async function refresh() {
    try {
      setMedia(await getMediaLibrary());
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function upload(files: FileList | File[]) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_NEW_UPLOAD_BYTES)
          throw Error(`${file.name}: choose a photo up to 3 MB.`);
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        await saveMedia({
          data: { action: "upload", payload: { name: file.name, data, alt: "" } },
        });
      }
      await refresh();
      setStatus("Photos uploaded privately. Add alt text and select photos for a project.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function pick(m: MediaRow) {
    setSelected(m);
    setRotation(0);
    setCrop({ left: 0, top: 0, width: 100, height: 100 });
    setCropEnabled(false);
  }
  async function edit(archive = false) {
    if (!selected) return;
    if (archive && !window.confirm("Archive this unused photo?")) return;
    setBusy(true);
    setError("");
    try {
      await saveMedia({
        data: {
          action: "edit",
          payload: {
            id: selected.id,
            version: selected.version,
            alt: selected.alt,
            tags: selected.tags,
            archive,
            rotation,
            crop: cropEnabled
              ? Object.fromEntries(Object.entries(crop).map(([k, v]) => [k, v / 100]))
              : null,
          },
        },
      });
      setSelected(null);
      await refresh();
      setStatus(archive ? "Photo archived." : "Photo saved. The source original is preserved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cc-tool-stack">
      <section className="cc-panel">
        <h2>Media library</h2>
        <p>
          Upload real finished work. Originals stay private; public derivatives are optimized and
          stripped of photo metadata. Publishing a project requires your permission confirmation.
        </p>
        <div
          className="cc-upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) void upload(e.dataTransfer.files);
          }}
        >
          <label className="cc-button secondary">
            {busy ? "Processing photos…" : "Upload photos"}
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={busy}
              onChange={(e) => {
                if (e.target.files) void upload(e.target.files);
              }}
            />
          </label>
          <p>Drop PNG, JPG or WebP photos here · up to 3 MB / 24 megapixels each</p>
        </div>
        {error && (
          <p role="alert" className="cc-error">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="cc-success">
            {status}
          </p>
        )}
        <label className="cc-field">
          Find media
          <input
            value={filter}
            placeholder="Name, alt text or tag"
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        {!media.length && (
          <p className="cc-empty">
            Your uploaded photos will appear here. Existing catalog and customer artwork are
            preserved in their original locations.
          </p>
        )}
        <div className="cc-media-grid">
          {media
            .filter((m) =>
              (m.name + " " + m.alt + " " + m.tags.join(" "))
                .toLowerCase()
                .includes(filter.toLowerCase()),
            )
            .map((m) => (
              <button key={m.id} className="cc-media-card" onClick={() => pick(m)}>
                <img src={`/api/media/${m.id}?thumbnail=1&v=${m.version}`} alt={m.alt || m.name} />
                <b>{m.name}</b>
                <small>
                  {m.width} × {m.height} · {(m.original_size / 1000000).toFixed(1)} MB original
                </small>
                <small>
                  {m.alt ? "Alt text added" : "Needs alt text"} · {m.references.length} references
                </small>
              </button>
            ))}
        </div>
        {selected && (
          <div className="cc-panel cc-media-edit">
            <h3>Edit {selected.name}</h3>
            <div className="cc-two-col">
              <div className="cc-crop-preview">
                <img
                  src={`/api/media/${selected.id}?original=1&v=${selected.version}`}
                  alt={selected.alt || selected.name}
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
                {cropEnabled && (
                  <div
                    style={{
                      left: `${crop.left}%`,
                      top: `${crop.top}%`,
                      width: `${crop.width}%`,
                      height: `${crop.height}%`,
                    }}
                  />
                )}
              </div>
              <div className="cc-form">
                <label className="cc-field">
                  Alt text
                  <input
                    maxLength={250}
                    value={selected.alt}
                    onChange={(e) => setSelected({ ...selected, alt: e.target.value })}
                  />
                </label>
                <label className="cc-field">
                  Tags, separated by commas
                  <input
                    value={selected.tags.join(", ")}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        tags: e.target.value.split(",").map((t) => t.trim()),
                      })
                    }
                  />
                </label>
                <label className="cc-field">
                  Rotate / straighten (degrees)
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={cropEnabled}
                    onChange={(e) => setCropEnabled(e.target.checked)}
                  />{" "}
                  Crop from original
                </label>
                {cropEnabled &&
                  Object.entries(crop).map(([k, v]) => (
                    <label className="cc-field" key={k}>
                      Crop {k} (%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={v}
                        onChange={(e) => setCrop({ ...crop, [k]: Number(e.target.value) })}
                      />
                    </label>
                  ))}
                <p className="cc-help">
                  Transforms are applied from the preserved original. References:{" "}
                  {selected.references.map((r) => r.scope + ": " + r.key).join(", ") || "None"}.
                </p>
                <a href={`/api/media/${selected.id}?original=1`}>Download private original</a>
                <div className="cc-actions">
                  <button disabled={busy} className="cc-button" onClick={() => void edit()}>
                    Save photo
                  </button>
                  <button
                    disabled={busy || !!selected.references.length}
                    className="cc-button secondary"
                    onClick={() => void edit(true)}
                  >
                    Archive unused photo
                  </button>
                  <button className="cc-button secondary" onClick={() => setSelected(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="cc-panel">
        <h2>Finished-work projects</h2>
        <div className="cc-actions">
          <label className="cc-field">
            Open project
            <select
              aria-label="Open project"
              value={row ? projectId : ""}
              onChange={(e) => {
                if (e.target.value) setProjectId(e.target.value);
              }}
            >
              <option value="">New project</option>
              {state.rows.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.draft.title}
                  {r.published ? " · Published" : " · Draft"}
                </option>
              ))}
            </select>
          </label>
          <button
            className="cc-button secondary"
            onClick={() => {
              setProjectId(crypto.randomUUID());
              setProject(blank());
            }}
          >
            New project
          </button>
        </div>
        <div className="cc-two-col">
          <div className="cc-form">
            <label className="cc-field">
              Project title
              <input
                maxLength={120}
                value={project.title}
                onChange={(e) => setProject({ ...project, title: e.target.value })}
              />
            </label>
            <label className="cc-field">
              Description
              <textarea
                aria-label="Description"
                maxLength={2000}
                value={project.description}
                onChange={(e) => setProject({ ...project, description: e.target.value })}
              />
            </label>
            <label className="cc-field">
              Category
              <input
                value={project.category}
                onChange={(e) => setProject({ ...project, category: e.target.value })}
              />
            </label>
            <label className="cc-field">
              Project tags
              <input
                value={project.tags.join(", ")}
                onChange={(e) =>
                  setProject({ ...project, tags: e.target.value.split(",").map((v) => v.trim()) })
                }
              />
            </label>
            <label className="cc-field">
              Customize a similar model
              <select
                aria-label="Customize a similar model"
                value={project.family}
                onChange={(e) => setProject({ ...project, family: e.target.value })}
              >
                <option value="">Any custom hat</option>
                {FAMILY_ORDER.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={project.featured}
                onChange={(e) => setProject({ ...project, featured: e.target.checked })}
              />{" "}
              Feature on homepage
            </label>
            <label>
              <input
                type="checkbox"
                checked={project.consent}
                onChange={(e) => setProject({ ...project, consent: e.target.checked })}
              />{" "}
              I have permission to publicly share these photos and any identifiable customer work.
            </label>
            <label>
              <input
                type="checkbox"
                checked={project.archived}
                onChange={(e) => setProject({ ...project, archived: e.target.checked })}
              />{" "}
              Archive / hide this project when published
            </label>
          </div>
          <div>
            <p>Select photos, then choose the cover and their order.</p>
            <div className="cc-media-grid compact">
              {media.map((m) => (
                <label className="cc-media-card" key={m.id}>
                  <img
                    src={`/api/media/${m.id}?thumbnail=1&v=${m.version}`}
                    alt={m.alt || m.name}
                  />
                  <span>
                    <input
                      type="checkbox"
                      checked={project.mediaIds.includes(m.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...project.mediaIds, m.id]
                          : project.mediaIds.filter((id) => id !== m.id);
                        setProject({
                          ...project,
                          mediaIds: ids,
                          coverId: ids.includes(project.coverId) ? project.coverId : (ids[0] ?? ""),
                        });
                      }}
                    />
                    {m.alt || m.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="cc-project-preview">
          <h3>Project preview</h3>
          <h4>{project.title || "Untitled project"}</h4>
          <p>{project.description}</p>
          <div className="cc-project-photos">
            {project.mediaIds.map((id, index) => (
              <figure key={id}>
                <img src={`/api/media/${id}`} alt={media.find((m) => m.id === id)?.alt ?? ""} />
                <figcaption>
                  <label>
                    <input
                      type="radio"
                      name="cover"
                      checked={project.coverId === id}
                      onChange={() => setProject({ ...project, coverId: id })}
                    />{" "}
                    Cover
                  </label>
                  <button
                    className="cc-button secondary"
                    disabled={!index}
                    onClick={() => {
                      const ids = [...project.mediaIds];
                      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                      setProject({ ...project, mediaIds: ids });
                    }}
                  >
                    Move earlier
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <PublishingControls state={state} documentKey={projectId} body={project} />
      </section>
    </div>
  );
}
