/** Readiness is an intake diagnostic, never production approval or a source edit. */
export type ArtworkMetadata = {
  mime: string;
  width: number;
  height: number;
  visibleWidth?: number;
  visibleHeight?: number;
  hasTransparency?: boolean;
  whiteEdges?: boolean;
  vectorComplexity?: number;
};
export function svgSafetyIssues(svg: string) {
  if (!/<svg[\s>]/i.test(svg)) return ["Choose a valid SVG document."];
  const unsafe =
    /<\s*(?:script|foreignObject|iframe|object|embed|audio|video|animate\w*|set|discard)\b|\bon\w+\s*=|<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|@import|\\/i.test(
      svg,
    );
  const references = [...svg.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)];
  const count = [...svg.matchAll(/\b(?:href|src)\s*=/gi)].length;
  const external =
    references.some((match) => !match[2].trim().startsWith("#")) ||
    references.length !== count ||
    [...svg.matchAll(/url\s*\(([^)]*)\)/gi)].some(
      ([, ref]) =>
        !ref
          .trim()
          .replace(/^["']|["']$/g, "")
          .startsWith("#"),
    );
  return unsafe || external
    ? [
        "This SVG contains active content or external references. Export a self-contained SVG with scripts, links and animation removed.",
      ]
    : [];
}
export function scanArtworkPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
) {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1,
    transparent = 0,
    white = 0,
    edges = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        alpha = pixels[i + 3];
      if (alpha < 250) transparent++;
      if (alpha > 16) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        edges++;
        if (alpha > 250 && pixels[i] > 242 && pixels[i + 1] > 242 && pixels[i + 2] > 242) white++;
      }
    }
  return {
    hasTransparency: transparent > 0,
    whiteEdges: edges > 0 && white / edges > 0.85,
    visibleWidthRatio: maxX < 0 ? 0 : (maxX - minX + 1) / width,
    visibleHeightRatio: maxY < 0 ? 0 : (maxY - minY + 1) / height,
  };
}
export function assessArtwork(
  metadata: ArtworkMetadata,
  inches: { width: number; height: number },
) {
  const messages: string[] = [];
  const vector = metadata.mime === "image/svg+xml",
    pdf = metadata.mime === "application/pdf";
  const density =
    metadata.width > 0 && metadata.height > 0
      ? Math.round(
          Math.min(
            (metadata.visibleWidth ?? metadata.width) / inches.width,
            (metadata.visibleHeight ?? metadata.height) / inches.height,
          ),
        )
      : null;
  if (pdf)
    messages.push(
      "PDF retained as the original. The owner must inspect its pages, fonts and production paths; no automatic preview or approval is implied.",
    );
  if (vector)
    messages.push(
      "Vector retained. The owner must check fonts, cutlines and overlapping paths before fabrication.",
    );
  if (!pdf && !vector && density !== null && density < 150)
    messages.push(
      "Visible artwork has limited pixels at this patch size. Supply a larger original or vector; the owner must review fine detail.",
    );
  if (metadata.whiteEdges && !metadata.hasTransparency)
    messages.push(
      "An opaque light background reaches the image edges. It may be meaningful artwork; the original is preserved and the owner must review it.",
    );
  if (!pdf && !vector && (metadata.visibleWidth === 0 || metadata.visibleHeight === 0))
    messages.push("No visible artwork was detected. Choose a different original for owner review.");
  if ((metadata.vectorComplexity ?? 0) > 2000)
    messages.push("Complex vector artwork needs manual contour review.");
  return {
    version: 1 as const,
    status:
      pdf || vector
        ? "Needs owner review"
        : density !== null && density < 150
          ? "Low resolution"
          : metadata.whiteEdges && !metadata.hasTransparency
            ? "Background may print"
            : "Ready for review",
    metadata,
    pixelsPerInch: pdf || vector ? null : density,
    messages,
    productionApproved: false,
  };
}
