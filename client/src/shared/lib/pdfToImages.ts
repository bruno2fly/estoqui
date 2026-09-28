/**
 * Client-side PDF page rendering — the door that lets ANY size of vendor PDF
 * into the AI pipeline.
 *
 * The AI server only accepts small requests (~3 MB), and reading a giant PDF
 * in one gulp produces truncated extractions anyway. So instead of sending
 * the PDF, we render each page to a JPEG right here in the browser and feed
 * the pages through the existing screenshot batch pipeline (5 pages per AI
 * call, combined review at the end). A 50-page, 20 MB price list just works.
 *
 * pdfjs-dist is imported dynamically so it never weighs down the main bundle.
 */

export interface PdfRenderProgress {
  page: number
  totalPages: number
}

/**
 * Render every page of a PDF into JPEG File objects (~1600px wide, q=0.8 —
 * plenty for AI text reading, small enough that each page stays well under
 * the request limit).
 */
export async function pdfToImageFiles(
  file: File,
  onProgress?: (p: PdfRenderProgress) => void,
  maxPages = 120
): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()

  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  const total = Math.min(doc.numPages, maxPages)
  const baseName = file.name.replace(/\.pdf$/i, '')
  const out: File[] = []

  for (let i = 1; i <= total; i++) {
    onProgress?.({ page: i, totalPages: total })
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const scale = Math.min(2.5, Math.max(1, 1600 / viewport.width))
    const scaled = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(scaled.width)
    canvas.height = Math.ceil(scaled.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not available')
    await page.render({ canvasContext: ctx, viewport: scaled }).promise

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    )
    if (blob) {
      // Zero-padded page number keeps the batch pipeline's name-sort in order.
      const n = String(i).padStart(3, '0')
      out.push(new File([blob], `${baseName}-page-${n}.jpg`, { type: 'image/jpeg' }))
    }
    page.cleanup()
  }
  await doc.destroy()
  return out
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}
