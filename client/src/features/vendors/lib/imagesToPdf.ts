/**
 * Client-side image batching and filtering utilities.
 * Groups multiple screenshot images into batches for efficient GPT-4o processing.
 */

/**
 * Combine multiple image Files into batched groups, returning each group as a single File.
 * Since GPT-4o vision handles multiple images well, we send them as separate images
 * in the same API call content array rather than stitching into actual PDFs.
 *
 * This function groups the images into batches of `batchSize`.
 */
export function batchImageFiles(
  files: File[],
  batchSize: number = 10
): File[][] {
  const batches: File[][] = []
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize))
  }
  return batches
}

/**
 * Sort files naturally by name (so screenshot_1, screenshot_2, ... screenshot_10 sort correctly)
 */
export function sortFilesByName(files: File[]): File[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  )
}

/**
 * Filter to only image files
 */
export function filterImageFiles(files: File[]): File[] {
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  const imageExts = /\.(png|jpe?g|webp|gif)$/i
  return files.filter(
    (f) => imageTypes.includes(f.type) || imageExts.test(f.name)
  )
}
