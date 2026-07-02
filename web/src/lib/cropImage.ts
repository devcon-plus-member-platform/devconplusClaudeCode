import type { Area } from 'react-easy-crop'

/** Max output dimensions for a cropped 16:9 cover — standardizes size and caps upload weight. */
const MAX_OUTPUT_WIDTH = 1280
const MAX_OUTPUT_HEIGHT = 720
/** WebP quality for the exported cover (0–1). */
const OUTPUT_QUALITY = 0.9

/** Load an <img> from a (blob/object) URL. Same-origin blob URLs do not taint the canvas. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', () => reject(new Error('Failed to load image for cropping.')))
    img.src = src
  })
}

/**
 * Crop `imageSrc` to the pixel rectangle `cropPixels` (from react-easy-crop's
 * onCropComplete), scaling the result down to fit within MAX_OUTPUT_WIDTH/HEIGHT
 * (never upscaling), and return it as a WebP `File`.
 */
export async function getCroppedFile(
  imageSrc: string,
  cropPixels: Area,
  fileName: string,
): Promise<File> {
  const image = await loadImage(imageSrc)

  // Scale the crop rect down to the output cap while preserving aspect ratio.
  const scale = Math.min(
    1,
    MAX_OUTPUT_WIDTH / cropPixels.width,
    MAX_OUTPUT_HEIGHT / cropPixels.height,
  )
  const outWidth = Math.round(cropPixels.width * scale)
  const outHeight = Math.round(cropPixels.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context.')

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outWidth,
    outHeight,
  )

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', OUTPUT_QUALITY),
  )
  if (!blob) throw new Error('Failed to export cropped image.')

  const webpName = `${fileName.replace(/\.\w+$/, '')}.webp`
  return new File([blob], webpName, { type: 'image/webp' })
}
