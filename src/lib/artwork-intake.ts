import { scanArtworkPixels, svgSafetyIssues, type ArtworkMetadata } from "./artwork-readiness";
/** Samples a derivative for diagnostics. Never writes a canvas over the upload. */
export async function inspectArtworkFile(file: File): Promise<ArtworkMetadata> {
  if (file.type === "application/pdf") return { mime: file.type, width: 0, height: 0 };
  if (file.type === "image/svg+xml") {
    const svg = await file.text(),
      issues = svgSafetyIssues(svg);
    if (issues.length) throw Error(issues[0]);
    return {
      mime: file.type,
      width: 0,
      height: 0,
      vectorComplexity: (svg.match(/[MmLlHhVvCcSsQqTtAaZz](?=[\s\d.,+-])/g) ?? []).length,
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Error("This artwork image could not be decoded."));
      img.src = url;
    });
    if (image.naturalWidth * image.naturalHeight > 32_000_000)
      throw Error(
        "Choose an artwork image with no more than 32 million pixels, or provide a PDF for manual review.",
      );
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw Error(
        "Artwork diagnostics are unavailable in this browser. Keep the original for owner review.",
      );
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const sample = scanArtworkPixels(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
    return {
      mime: file.type,
      width: image.naturalWidth,
      height: image.naturalHeight,
      hasTransparency: sample.hasTransparency,
      whiteEdges: sample.whiteEdges,
      visibleWidth: Math.round(sample.visibleWidthRatio * image.naturalWidth),
      visibleHeight: Math.round(sample.visibleHeightRatio * image.naturalHeight),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
