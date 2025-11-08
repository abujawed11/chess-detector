import { useState, useRef, useEffect } from 'react'
import './CornerAdjuster.css'

const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL']
const CORNER_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']

export default function CornerAdjuster({ imageSrc, initialCorners, onCornersChange, onConfirm }) {
  const [corners, setCorners] = useState(initialCorners || [[0,0], [100,0], [100,100], [0,100]])
  const [dragging, setDragging] = useState(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null)
  const imageRef = useRef(null)

  useEffect(() => {
    if (initialCorners) {
      setCorners(initialCorners)
    }
  }, [initialCorners])

  useEffect(() => {
    if (onCornersChange) {
      onCornersChange(corners)
    }
  }, [corners, onCornersChange])

  const handleImageLoad = (e) => {
    const img = e.target
    const rect = img.getBoundingClientRect()
    setImageSize({ width: rect.width, height: rect.height })
    
    // If corners aren't set, initialize to image corners
    if (!initialCorners) {
      const naturalWidth = img.naturalWidth
      const naturalHeight = img.naturalHeight
      setCorners([
        [0, 0],
        [naturalWidth, 0],
        [naturalWidth, naturalHeight],
        [0, naturalHeight]
      ])
    }
  }

  const handleMouseDown = (index, e) => {
    e.preventDefault()
    setDragging(index)
  }

  const handleMouseMove = (e) => {
    if (dragging === null || !imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const scaleX = imageRef.current.naturalWidth / rect.width
    const scaleY = imageRef.current.naturalHeight / rect.height

    const x = Math.max(0, Math.min((e.clientX - rect.left) * scaleX, imageRef.current.naturalWidth))
    const y = Math.max(0, Math.min((e.clientY - rect.top) * scaleY, imageRef.current.naturalHeight))

    setCorners(prev => {
      const newCorners = [...prev]
      newCorners[dragging] = [Math.round(x), Math.round(y)]
      return newCorners
    })
  }

  const handleMouseUp = () => {
    setDragging(null)
  }

  const handleTouchStart = (index, e) => {
    e.preventDefault()
    setDragging(index)
  }

  const handleTouchMove = (e) => {
    if (dragging === null || !imageRef.current) return
    e.preventDefault()

    const touch = e.touches[0]
    const rect = imageRef.current.getBoundingClientRect()
    const scaleX = imageRef.current.naturalWidth / rect.width
    const scaleY = imageRef.current.naturalHeight / rect.height

    const x = Math.max(0, Math.min((touch.clientX - rect.left) * scaleX, imageRef.current.naturalWidth))
    const y = Math.max(0, Math.min((touch.clientY - rect.top) * scaleY, imageRef.current.naturalHeight))

    setCorners(prev => {
      const newCorners = [...prev]
      newCorners[dragging] = [Math.round(x), Math.round(y)]
      return newCorners
    })
  }

  const handleTouchEnd = () => {
    setDragging(null)
  }

  const resetCorners = () => {
    if (imageRef.current) {
      const w = imageRef.current.naturalWidth
      const h = imageRef.current.naturalHeight
      setCorners([[0, 0], [w, 0], [w, h], [0, h]])
    }
  }

  const expandCorners = (amount) => {
    if (!imageRef.current) return
    const w = imageRef.current.naturalWidth
    const h = imageRef.current.naturalHeight
    
    setCorners(prev => prev.map(([x, y]) => {
      const cx = w / 2
      const cy = h / 2
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = (dist + amount) / dist
      return [
        Math.max(0, Math.min(w, cx + dx * scale)),
        Math.max(0, Math.min(h, cy + dy * scale))
      ]
    }))
  }

  const getCornerPosition = (index) => {
    if (!imageRef.current) return { left: 0, top: 0 }
    const rect = imageRef.current.getBoundingClientRect()
    const scaleX = rect.width / imageRef.current.naturalWidth
    const scaleY = rect.height / imageRef.current.naturalHeight
    const [x, y] = corners[index]
    return {
      left: x * scaleX,
      top: y * scaleY
    }
  }

  const getSvgPath = () => {
    if (!imageRef.current) return ''
    const rect = imageRef.current.getBoundingClientRect()
    const scaleX = rect.width / imageRef.current.naturalWidth
    const scaleY = rect.height / imageRef.current.naturalHeight
    
    const points = corners.map(([x, y]) => `${x * scaleX},${y * scaleY}`).join(' ')
    return points
  }

  return (
    <div className="corner-adjuster">
      <div className="corner-controls">
        <button onClick={resetCorners} className="btn-small">Reset to Edges</button>
        <button onClick={() => expandCorners(20)} className="btn-small">Expand +</button>
        <button onClick={() => expandCorners(-20)} className="btn-small">Shrink -</button>
        {onConfirm && (
          <button onClick={() => onConfirm(corners)} className="btn-primary">
            ✓ Generate FEN
          </button>
        )}
      </div>
      
      <div 
        ref={containerRef}
        className="corner-canvas"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img 
          ref={imageRef}
          src={imageSrc} 
          alt="Adjust corners"
          onLoad={handleImageLoad}
          draggable={false}
        />
        
        <svg className="corner-overlay">
          <polygon 
            points={getSvgPath()}
            fill="rgba(0, 255, 0, 0.1)"
            stroke="#00ff00"
            strokeWidth="2"
          />
        </svg>

        {corners.map((corner, index) => {
          const pos = getCornerPosition(index)
          return (
            <div
              key={index}
              className={`corner-handle ${dragging === index ? 'dragging' : ''}`}
              style={{
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                backgroundColor: CORNER_COLORS[index]
              }}
              onMouseDown={(e) => handleMouseDown(index, e)}
              onTouchStart={(e) => handleTouchStart(index, e)}
            >
              <span className="corner-label">{CORNER_LABELS[index]}</span>
            </div>
          )
        })}
      </div>
      
      <div className="corner-info">
        <small className="muted">
          Drag the colored circles to adjust board corners. TL=Top-Left, TR=Top-Right, BR=Bottom-Right, BL=Bottom-Left
        </small>
      </div>
    </div>
  )
}

