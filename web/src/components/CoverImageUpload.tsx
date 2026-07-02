import { useEffect, useRef, useState } from 'react'
import { GalleryAddOutline, CloseCircleLineDuotone } from 'solar-icon-set'
import ImageCropModal from './ImageCropModal'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

interface Props {
  /** Existing cover URL to seed the preview (event edit / admin). */
  initialPreviewUrl?: string | null
  /** Fires whenever the cropped file / preview changes (including removal). */
  onChange: (result: { file: File | null; previewUrl: string | null }) => void
  /** Parent-supplied error (e.g. an upload failure from onSubmit). */
  error?: string | null
  disabled?: boolean
}

/**
 * Shared event-cover picker: validate → crop to 16:9 → preview. Owns the file
 * input, drag-and-drop, the crop modal, and object-URL lifecycle. Hands the
 * parent a cropped WebP `File` via onChange; the parent uploads it on submit.
 */
export default function CoverImageUpload({
  initialPreviewUrl,
  onChange,
  error,
  disabled = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(initialPreviewUrl ?? null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropName, setCropName] = useState('cover')
  const [recropping, setRecropping] = useState(false)

  // Object URL of the original picked file (fed to the cropper — kept for re-crop).
  const originalUrlRef = useRef<string | null>(null)
  // Object URL of the cropped preview (shown in the <img>).
  const previewUrlRef = useRef<string | null>(null)

  // Revoke any live object URLs on unmount.
  useEffect(() => {
    return () => {
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const openCropForFile = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setValidationError('Only JPG, PNG, or WebP images are allowed.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setValidationError('Image must be under 5 MB.')
      return
    }
    setValidationError(null)
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current)
    const url = URL.createObjectURL(file)
    originalUrlRef.current = url
    setCropName(file.name)
    setCropSrc(url)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) openCropForFile(file)
    // Reset so re-picking the same file still fires change.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) openCropForFile(file)
  }

  // Re-open the crop modal on the current image. For a locally picked file we
  // reuse its object URL; for an existing (remote) cover we fetch it into a blob
  // first so the canvas can read it without tainting.
  const handleRecrop = async () => {
    if (originalUrlRef.current) {
      setCropSrc(originalUrlRef.current)
      return
    }
    if (!preview) return
    setRecropping(true)
    setValidationError(null)
    try {
      const res = await fetch(preview)
      if (!res.ok) throw new Error('Failed to fetch image')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      originalUrlRef.current = url
      setCropName('cover')
      setCropSrc(url)
    } catch {
      setValidationError('Couldn’t load the current image for cropping. Please upload a new one instead.')
    } finally {
      setRecropping(false)
    }
  }

  const handleCropApply = (croppedFile: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(croppedFile)
    previewUrlRef.current = url
    setPreview(url)
    setCropSrc(null)
    onChange({ file: croppedFile, previewUrl: url })
  }

  const removeCover = () => {
    if (originalUrlRef.current) {
      URL.revokeObjectURL(originalUrlRef.current)
      originalUrlRef.current = null
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview(null)
    setValidationError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onChange({ file: null, previewUrl: null })
  }

  const shownError = validationError ?? error

  return (
    <>
      {preview ? (
        <div className="relative rounded-xl overflow-hidden mb-3 border border-slate-200">
          <img src={preview} alt="Cover preview" className="w-full h-44 object-cover" />
          <button
            type="button"
            disabled={disabled || recropping}
            onClick={() => void handleRecrop()}
            className="absolute bottom-2 left-2 px-3 py-1.5 rounded-full bg-slate-900/60 text-white text-[11px] font-semibold disabled:opacity-50"
          >
            {recropping ? 'Loading…' : 'Re-crop'}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={removeCover}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/60 flex items-center justify-center disabled:opacity-50"
            aria-label="Remove cover image"
          >
            <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
          onDrop={handleDrop}
          className={`w-full h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors mb-3 disabled:opacity-50 ${
            isDragging
              ? 'border-blue bg-blue/5 text-blue'
              : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-blue hover:text-blue'
          }`}
        >
          <GalleryAddOutline className="w-6 h-6" />
          <span className="text-md3-label-md font-medium">Click or drag to upload cover image</span>
          <span className="text-[10px] text-slate-300">JPG, PNG, WebP — optional</span>
          <span className="text-[10px] text-slate-300">Recommended: 1200 × 675 px (16:9), max 5 MB</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {shownError && <p className="text-md3-label-md text-red mt-1">{shownError}</p>}

      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          fileName={cropName}
          onApply={handleCropApply}
          onClose={() => setCropSrc(null)}
        />
      )}
    </>
  )
}
