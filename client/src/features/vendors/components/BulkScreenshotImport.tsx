import { useState, useRef, useCallback, type DragEvent } from 'react'
import { Button } from '@/shared/components'
import { batchImageFiles, sortFilesByName, filterImageFiles } from '../lib/imagesToPdf'
import {
  processBulkScreenshots,
  type BulkParseProgress,
  type BulkExtractedRow,
} from '../lib/vendorBulkParse'

interface BulkScreenshotImportProps {
  apiKey: string
  onImport: (rows: BulkExtractedRow[]) => void
  onCancel: () => void
}

type Step = 'upload' | 'processing' | 'review'

export function BulkScreenshotImport({ apiKey, onImport, onCancel }: BulkScreenshotImportProps) {
  const [step, setStep] = useState<Step>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<BulkParseProgress | null>(null)
  const [results, setResults] = useState<BulkExtractedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [showHelp, setShowHelp] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  // --- File handling ---
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const imageFiles = filterImageFiles(Array.from(newFiles))
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size))
      const unique = imageFiles.filter((f) => !existing.has(f.name + f.size))
      return sortFilesByName([...prev, ...unique])
    })
  }, [])

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  // --- Processing ---
  const startProcessing = async () => {
    if (files.length === 0) return
    abortRef.current = false
    setStep('processing')
    setErrors([])

    const batches = batchImageFiles(files, 5) // 5 images per batch for reliable token limits
    const allErrors: string[] = []

    const rows = await processBulkScreenshots(batches, apiKey, (p) => {
      setProgress(p)
      if (p.errorMessage) allErrors.push(p.errorMessage)
    })

    setErrors(allErrors)
    setResults(rows)
    setSelectedRows(new Set(rows.map((_, i) => i)))
    setStep('review')
  }

  // --- Review ---
  const toggleRow = (idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedRows.size === results.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(results.map((_, i) => i)))
    }
  }

  const handleImport = () => {
    const selected = results.filter((_, i) => selectedRows.has(i))
    onImport(selected)
  }

  const highCount = results.filter((r) => r.confidence === 'high').length
  const medCount = results.filter((r) => r.confidence === 'medium').length
  const lowCount = results.filter((r) => r.confidence === 'low').length

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="border border-surface-border rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Bulk Screenshot Import
        </h3>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="text-xs text-primary hover:text-primary/80 font-medium"
        >
          {showHelp ? 'Hide instructions' : 'How to get screenshots from WhatsApp'}
        </button>
      </div>

      {/* WhatsApp Help Instructions */}
      {showHelp && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg px-4 py-3 space-y-3 text-sm text-green-800 dark:text-green-200">
          <p className="font-semibold">How to download all images from WhatsApp:</p>

          <div className="space-y-2">
            <p className="font-medium">iPhone / iPad:</p>
            <ol className="list-decimal pl-5 space-y-1 text-[13px]">
              <li>Open the WhatsApp chat with the vendor</li>
              <li>Tap the vendor's name at the top</li>
              <li>Tap <strong>"Media, Links and Docs"</strong></li>
              <li>Tap <strong>"Select"</strong> (top right)</li>
              <li>Tap <strong>"Select All"</strong> (or pick the screenshots you need)</li>
              <li>Tap the <strong>Share</strong> button (box with arrow)</li>
              <li>Choose <strong>"Save to Files"</strong> and pick a folder</li>
              <li>Then drag all the saved images here!</li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Android:</p>
            <ol className="list-decimal pl-5 space-y-1 text-[13px]">
              <li>Open the WhatsApp chat with the vendor</li>
              <li>Tap the <strong>three dots menu</strong> (top right)</li>
              <li>Tap <strong>"Media"</strong></li>
              <li>Long-press one image, then tap <strong>"Select All"</strong></li>
              <li>Tap the <strong>Share</strong> icon</li>
              <li>Choose <strong>"Save to device"</strong> or share to Google Drive / Files</li>
              <li>Then drag all the saved images here!</li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="font-medium">WhatsApp Web (fastest!):</p>
            <ol className="list-decimal pl-5 space-y-1 text-[13px]">
              <li>Open <strong>web.whatsapp.com</strong> on your computer</li>
              <li>Open the vendor chat</li>
              <li>Click the vendor name at the top</li>
              <li>Click <strong>"Media, links, and docs"</strong></li>
              <li>Download each image (or use a browser extension to bulk download)</li>
              <li>Then drag all the saved images here!</li>
            </ol>
          </div>
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <>
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            className={`
              border-2 border-dashed rounded-xl px-6 py-8 cursor-pointer transition-colors text-center
              ${dragging
                ? 'border-primary bg-primary/5'
                : 'border-surface-border hover:border-primary/40 hover:bg-surface-hover'}
            `}
          >
            <svg className="w-8 h-8 text-muted mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm text-fg-secondary font-medium">
              Drop all vendor screenshots here
            </p>
            <p className="text-xs text-muted mt-1">
              PNG, JPG, WebP — select multiple files at once
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
            className="hidden"
          />

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-fg">
                  {files.length} screenshot{files.length !== 1 ? 's' : ''} loaded
                </p>
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className="text-xs text-danger hover:text-danger/80"
                >
                  Remove all
                </button>
              </div>
              <div className="max-h-[150px] overflow-y-auto space-y-1 pr-1">
                {files.map((f, i) => (
                  <div
                    key={f.name + f.size}
                    className="flex items-center justify-between text-xs bg-surface-hover rounded-lg px-3 py-1.5"
                  >
                    <span className="text-fg truncate max-w-[300px]">
                      <span className="text-muted mr-2">{i + 1}.</span>
                      {f.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-danger hover:text-danger/80"
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                <strong>Estimated:</strong>{' '}
                {Math.ceil(files.length / 5)} API calls{' '}
                ({Math.ceil(files.length / 5) * 5 > files.length
                  ? `${files.length} images in ${Math.ceil(files.length / 5)} batches of 5`
                  : `${files.length} images in ${files.length / 5} batches of 5`
                })
                {' · ~'}
                {Math.ceil(files.length * 9)} products expected
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={startProcessing}
              disabled={files.length === 0 || !apiKey}
            >
              Process {files.length} screenshot{files.length !== 1 ? 's' : ''}
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* STEP 2: Processing */}
      {step === 'processing' && progress && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg font-medium">
                {progress.status === 'deduplicating'
                  ? 'Removing duplicates...'
                  : progress.status === 'done'
                    ? 'Done!'
                    : `Processing batch ${progress.currentBatch} of ${progress.totalBatches}...`}
              </span>
              <span className="text-muted">
                {progress.productsFound} products found
              </span>
            </div>
            <div className="h-2 bg-surface-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((progress.currentBatch / progress.totalBatches) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted">
              {progress.status === 'processing'
                ? `Sending ${Math.min(5, files.length - (progress.currentBatch - 1) * 5)} screenshots to AI...`
                : progress.status === 'deduplicating'
                  ? 'Checking for duplicate products across screenshots...'
                  : 'Complete!'}
            </p>
          </div>

          {errors.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-medium mb-1">{errors.length} batch error(s) — processing continued:</p>
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Review */}
      {step === 'review' && (
        <div className="space-y-3">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="bg-surface-hover rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold text-fg">{results.length}</p>
              <p className="text-[10px] text-muted uppercase">Total Products</p>
            </div>
            <div className="bg-surface-hover rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold text-green-600">{highCount}</p>
              <p className="text-[10px] text-muted uppercase">High Confidence</p>
            </div>
            <div className="bg-surface-hover rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold text-amber-600">{medCount}</p>
              <p className="text-[10px] text-muted uppercase">Medium</p>
            </div>
            <div className="bg-surface-hover rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold text-red-600">{lowCount}</p>
              <p className="text-[10px] text-muted uppercase">Low / Uncertain</p>
            </div>
            <div className="bg-surface-hover rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold text-fg">{selectedRows.size}</p>
              <p className="text-[10px] text-muted uppercase">Selected</p>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {errors.length} batch(es) had errors — some products may be missing.
            </div>
          )}

          {/* Table */}
          <div className="max-h-[400px] overflow-y-auto border border-surface-border rounded-lg">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-surface z-10">
                <tr className="border-b border-surface-border">
                  <th className="py-2 px-2 text-left">
                    <input
                      type="checkbox"
                      checked={selectedRows.size === results.length}
                      onChange={toggleAll}
                      className="accent-primary"
                    />
                  </th>
                  <th className="py-2 px-2 text-left text-fg-secondary font-semibold">#</th>
                  <th className="py-2 px-2 text-left text-fg-secondary font-semibold">SKU</th>
                  <th className="py-2 px-2 text-left text-fg-secondary font-semibold">Product</th>
                  <th className="py-2 px-2 text-left text-fg-secondary font-semibold">Brand</th>
                  <th className="py-2 px-2 text-left text-fg-secondary font-semibold">Size</th>
                  <th className="py-2 px-2 text-right text-fg-secondary font-semibold">Price</th>
                  <th className="py-2 px-2 text-center text-fg-secondary font-semibold">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-surface-border ${
                      selectedRows.has(i) ? '' : 'opacity-40'
                    } ${
                      row.confidence === 'low'
                        ? 'bg-red-50/50 dark:bg-red-900/10'
                        : ''
                    }`}
                  >
                    <td className="py-1.5 px-2">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(i)}
                        onChange={() => toggleRow(i)}
                        className="accent-primary"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-muted">{i + 1}</td>
                    <td className="py-1.5 px-2 text-fg font-mono text-[11px]">
                      {row.sku || <span className="text-muted">-</span>}
                    </td>
                    <td className="py-1.5 px-2 text-fg max-w-[200px] truncate">{row.name}</td>
                    <td className="py-1.5 px-2 text-fg-secondary">{row.brand || '-'}</td>
                    <td className="py-1.5 px-2 text-fg-secondary whitespace-nowrap">
                      {row.unitSize || '-'}
                      {row.packType === 'CASE' && (
                        <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                          x{row.unitsPerCase}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right text-fg font-medium">
                      ${row.price.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          row.confidence === 'high'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                            : row.confidence === 'medium'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {row.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleImport} disabled={selectedRows.size === 0}>
              Import {selectedRows.size} product{selectedRows.size !== 1 ? 's' : ''}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStep('upload')
                setResults([])
                setErrors([])
              }}
            >
              Back to upload
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
