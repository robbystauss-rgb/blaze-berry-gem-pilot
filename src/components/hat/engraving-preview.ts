/** Browser-only derivative for the mockup. Never replaces the production upload. */
export async function engravingPreview(source: string, ink: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(Error("Artwork preview could not load."));
    i.src = source;
  });
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("Canvas unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const color = ink.replace("#", ""),
    red = parseInt(color.slice(0, 2), 16),
    green = parseInt(color.slice(2, 4), 16),
    blue = parseInt(color.slice(4, 6), 16);
  let transparent = false,
    coverage = 0,
    darkSum = 0;
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i + 3] < 128) transparent = true;
    else {
      coverage++;
      darkSum +=
        1 -
        (0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] + 0.0722 * pixels.data[i + 2]) / 255;
    }
  }
  const whiteLogo = transparent && coverage > 0 && darkSum / coverage < 0.08;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const darkness = whiteLogo
      ? 1
      : 1 -
        (0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] + 0.0722 * pixels.data[i + 2]) / 255;
    pixels.data[i + 3] = Math.round(pixels.data[i + 3] * darkness);
    pixels.data[i] = red;
    pixels.data[i + 1] = green;
    pixels.data[i + 2] = blue;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}
