import React, { useEffect, useMemo, useRef, useState } from 'react'

/**
 * ChainLogo
 * ----------
 * - Tries the provided src first.
 * - If it fails, falls back to local /public paths:
 * - type === 'chain' -> /logos/chains/generic.png
 * - type === 'token' -> /logos/tokens/generic-token.png
 * - Preloads the image URL to avoid flicker.
 * - Props:
 * - src : string | undefined (preferred remote URL)
 * - alt : string
 * - type : 'chain' | 'token' (default 'chain')
 * - size : number in px (default 20)
 * - rounded : boolean (default true)
 * - glow : boolean (default true)
 * - className : string
 */
export default function ChainLogo({
  src,
  alt = '',
  type = 'chain',
  size = 20,
  rounded = true,
  glow = true,
  className = '',
}) {
  const fallback = type === 'token'
    ? '/logos/tokens/generic-token.png'
    : '/logos/chains/generic.png'

  // choose the first non-empty candidate; we’ll update on errors
  const [currentSrc, setCurrentSrc] = useState(src || fallback)
  const [loaded, setLoaded] = useState(false)
  const hasErrored = useRef(false)

  // if `src` prop changes, try it again
  useEffect(() => {
    hasErrored.current = false
    setLoaded(false)
    setCurrentSrc(src || fallback)
  }, [src, fallback])

  // preload to avoid layout shifts / flashes
  useEffect(() => {
    if (!currentSrc) return
    const img = new Image()
    img.onload = () => setLoaded(true)
    img.onerror = () => {
      if (!hasErrored.current && currentSrc !== fallback) {
        hasErrored.current = true
        setCurrentSrc(fallback)
      } else {
        setLoaded(true) // show fallback even if it 404s (cached broken)
      }
    }
    img.src = currentSrc
    // no cleanup required
  }, [currentSrc, fallback])

  const style = useMemo(
    () => ({
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: rounded ? '50%' : '8px',
      objectFit: 'cover',
      display: 'block',
      boxShadow: glow
        ? '0 0 10px rgba(16, 185, 129, 0.35), 0 0 2px rgba(16,185,129,0.4)'
        : 'none',
      transition: 'opacity 160ms ease-out, transform 160ms ease-out',
      opacity: loaded ? 1 : 0,
      transform: loaded ? 'scale(1)' : 'scale(0.98)',
      background:
        'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
    }),
    [size, rounded, glow, loaded]
  )

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? '50%' : '8px',
        overflow: 'hidden',
        position: 'relative',
      }}
      aria-label={alt}
      title={alt}
    >
      {!loaded && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: rounded ? '50%' : '8px',
            background:
              'linear-gradient(100deg, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0.12) 40%, rgba(255,255,255,0.04) 60%)',
            backgroundSize: '200% 100%',
            animation: 'logoShimmer 0.9s ease-in-out infinite',
          }}
        />
      )}
      {/* We still render the <img> so onError can swap to fallback immediately */}
      <img
        src={currentSrc}
        alt={alt}
        style={style}
        onError={() => {
          if (!hasErrored.current && currentSrc !== fallback) {
            hasErrored.current = true
            setCurrentSrc(fallback)
          }
        }}
        draggable={false}
      />
      {/* keyframes (scoped) */}
      <style>{`
        @keyframes logoShimmer {
          0% { background-position: 180% 0; }
          100% { background-position: -20% 0; }
        }
      `}</style>
    </div>
  )
}