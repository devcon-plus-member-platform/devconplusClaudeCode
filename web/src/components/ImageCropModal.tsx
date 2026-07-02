import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { CloseCircleOutline } from 'solar-icon-set'
import { backdrop, slideUp } from '../lib/animation'
import { getCroppedFile } from '../lib/cropImage'

interface Props {
  /** Object/blob URL of the source image to crop. */
  src: string
  /** Original file name — used to name the exported .webp file. */
  fileName: string
  /** Called with the cropped WebP File when the user taps Apply. */
  onApply: (file: File) => void
  onClose: () => void
}

/** Fixed 16:9 crop sheet for event cover images. */
export default function ImageCropModal({ src, fileName, onApply, onClose }: Props) {
  const [visible, setVisible] = useState(true)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPixels, setAreaPixels] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 220)
  }

  const handleApply = async () => {
    if (!areaPixels) return
    setError(null)
    setIsProcessing(true)
    try {
      const file = await getCroppedFile(src, areaPixels, fileName)
      onApply(file)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not crop the image.')
    } finally {
      setIsProcessing(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 z-[100]"
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[110] bg-white rounded-t-3xl max-h-[90dvh] flex flex-col shadow-2xl"
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle + title row */}
            <div className="relative flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
              <div className="w-9 h-1 bg-slate-200 rounded-full absolute left-1/2 -translate-x-1/2 top-2" />
              <h2 className="text-md3-title-md font-bold text-slate-900 font-proxima">Adjust cover</h2>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <CloseCircleOutline color="#94A3B8" size={22} />
              </button>
            </div>

            {/* Crop area */}
            <div className="px-4 pt-4 pb-2">
              <div className="relative w-full h-64 sm:h-72 bg-slate-900 rounded-2xl overflow-hidden">
                <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  aspect={16 / 9}
                  minZoom={1}
                  maxZoom={3}
                  showGrid
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area, areaPixelsValue) => setAreaPixels(areaPixelsValue)}
                />
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-2">
                Drag to reposition · pinch or use the slider to zoom
              </p>
            </div>

            {/* Zoom slider */}
            <div className="px-4 pb-2 flex items-center gap-3">
              <span className="text-md3-label-md text-slate-500 shrink-0">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-primary"
                aria-label="Zoom"
              />
            </div>

            {error && <p className="px-4 text-md3-label-md text-red">{error}</p>}

            {/* Footer */}
            <div className="flex gap-3 px-4 pt-3 pb-8 shrink-0">
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={handleClose}
                disabled={isProcessing}
                className="flex-1 py-3 bg-slate-100 text-slate-700 text-md3-body-md font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => void handleApply()}
                disabled={isProcessing || !areaPixels}
                className="flex-1 bg-primary text-white text-md3-body-md font-bold py-3 rounded-full shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {isProcessing ? 'Applying…' : 'Apply crop'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
