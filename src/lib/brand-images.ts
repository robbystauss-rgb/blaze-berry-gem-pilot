import manifest from "@/data/brand-renditions.json";
export const brandLogo = {
  src: manifest.images.find((image) => image.width === 768)!.imageUrl,
  srcSet: [
    ...manifest.images.map((image) => `${image.imageUrl} ${image.width}w`),
    `${manifest.original} ${manifest.sourceWidth}w`,
  ].join(", "),
  width: manifest.sourceWidth,
  height: manifest.sourceHeight,
};
