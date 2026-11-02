import sharp from "sharp";
import { assessArtwork, scanArtworkPixels, type ArtworkMetadata } from "@/lib/artwork-readiness";
export async function artworkReadiness(
  art: { bytes: Uint8Array; mime: string },
  inches: { width: number; height: number },
) {
  let metadata: ArtworkMetadata = { mime: art.mime, width: 0, height: 0 };
  if (art.mime === "image/svg+xml")
    metadata.vectorComplexity = (
      Buffer.from(art.bytes)
        .toString("utf8")
        .match(/[MmLlHhVvCcSsQqTtAaZz](?=[\s\d.,+-])/g) ?? []
    ).length;
  else if (art.mime.startsWith("image/")) {
    try {
      const image = sharp(art.bytes, { limitInputPixels: 32_000_000 }),
        source = await image.metadata();
      const width = source.orientation && source.orientation >= 5 ? source.height! : source.width!,
        height = source.orientation && source.orientation >= 5 ? source.width! : source.height!;
      const { data, info } = await image
        .rotate()
        .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const sample = scanArtworkPixels(data, info.width, info.height);
      metadata = {
        mime: art.mime,
        width,
        height,
        hasTransparency: sample.hasTransparency,
        whiteEdges: sample.whiteEdges,
        visibleWidth: Math.round(sample.visibleWidthRatio * width),
        visibleHeight: Math.round(sample.visibleHeightRatio * height),
      };
    } catch {
      throw Error(
        "This artwork could not be safely decoded. Choose a supported original with no more than 32 million pixels.",
      );
    }
  }
  return assessArtwork(metadata, inches);
}
