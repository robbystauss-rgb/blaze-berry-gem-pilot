import type { assessArtwork } from "@/lib/artwork-readiness";
export function ArtworkReadiness({ result }: { result: ReturnType<typeof assessArtwork> }) {
  return (
    <div
      className="rounded-xl bg-stage px-4 py-3 text-sm ring-1 ring-stage-line"
      role="status"
      data-artwork-readiness={result.status}
    >
      <p className="font-semibold">Artwork · {result.status}</p>
      {result.metadata.width > 0 && (
        <p className="mt-1 text-xs">
          Original: {result.metadata.width} × {result.metadata.height} pixels
          {result.pixelsPerInch !== null
            ? ` · approximately ${result.pixelsPerInch} visible pixels/inch at this size`
            : ""}
        </p>
      )}
      {result.messages.map((message) => (
        <p className="mt-2 leading-6" key={message}>
          {message}
        </p>
      ))}
      <p className="mt-2 text-xs leading-5">
        Your original stays intact. Preview effects and pixel checks do not approve artwork for
        production. Final artwork and cutlines are confirmed in your proof.
      </p>
    </div>
  );
}
