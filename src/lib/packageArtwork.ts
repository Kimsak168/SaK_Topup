// Loaded only after package artwork arrives; preserves the existing pixel algorithm.
// At most 32 small results (up to 4 MiB of strings), scoped to one package list.
function rememberArtwork(cache: Map<string, string | null>, key: string, result: string | null) {
  if (result === null || result.length <= 65_536) {
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }
  return result;
}

export function removeWhiteBackground(image: HTMLImageElement, cache: Map<string, string | null>): string | null {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height || width * height > 1_000_000) return null;

  // currentSrc includes the image revision and selected resolution, so separate
  // uploads and responsive variants cannot reuse each other's processed pixels.
  const key = JSON.stringify([image.currentSrc || image.src, width, height]);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, width, height);
    const { data } = pixels;
    const pixelCount = width * height;
    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let head = 0;
    let tail = 0;

    const isWhiteBackground = (pixel: number) => {
      const offset = pixel * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const minimum = Math.min(red, green, blue);
      const maximum = Math.max(red, green, blue);
      return minimum >= 224 && maximum - minimum <= 36;
    };

    const visit = (pixel: number) => {
      if (visited[pixel]) return;
      visited[pixel] = 1;
      if (isWhiteBackground(pixel)) queue[tail++] = pixel;
    };

    for (let x = 0; x < width; x++) {
      visit(x);
      visit((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      visit(y * width);
      visit(y * width + width - 1);
    }

    if (tail === 0) return rememberArtwork(cache, key, null);

    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      if (x > 0) visit(pixel - 1);
      if (x + 1 < width) visit(pixel + 1);
      if (pixel >= width) visit(pixel - width);
      if (pixel + width < pixelCount) visit(pixel + width);
    }

    for (let pixel = 0; pixel < pixelCount; pixel++) {
      if (!visited[pixel] || !isWhiteBackground(pixel)) continue;

      const offset = pixel * 4;
      const minimum = Math.min(data[offset], data[offset + 1], data[offset + 2]);
      const alpha = 1 - minimum / 255;
      if (alpha <= 0) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
        continue;
      }

      // Remove the white matte from edge pixels so it does not leave a pale halo.
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = Math.max(
          0,
          Math.min(255, Math.round((data[offset + channel] - 255 * (1 - alpha)) / alpha))
        );
      }
      data[offset + 3] = Math.round(alpha * 255);
    }

    context.putImageData(pixels, 0, 0);
    return rememberArtwork(cache, key, canvas.toDataURL("image/png"));
  } catch {
    return null;
  }
}

