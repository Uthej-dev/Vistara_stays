import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * Image with the loading behaviour the whole site needs:
 * - a calm tinted placeholder while loading (no layout shift: the wrapper sets the size)
 * - lazy loading by default; `priority` for the hero/above-the-fold image
 * - responsive `srcSet` so phones download small files
 * - a designed fallback if the image fails, instead of a broken-image icon
 *
 * `image` shape: { src, srcSet: {500: url, 960: url, ...}, alt }
 * `fill` makes the image cover its nearest positioned parent (for background images like the hero);
 * otherwise the caller sizes it, usually with an aspect-ratio class.
 */
export default function SmartImage({ image, alt, sizes = '100vw', priority = false, fill = false, className, imgClassName }) {
  const [status, setStatus] = useState(image?.src ? 'loading' : 'error')
  const altText = alt ?? image?.alt ?? ''

  const srcSet = image?.srcSet
    ? Object.entries(image.srcSet)
        .map(([width, url]) => `${url} ${width}w`)
        .join(', ')
    : undefined

  return (
    <div className={cn(fill ? 'absolute inset-0' : 'relative', 'overflow-hidden bg-forest-100', className)}>
      {status === 'error' ? (
        <div
          role="img"
          aria-label={altText || 'Image unavailable'}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-forest-100 to-cream-200 text-forest-700/70"
        >
          <ImageOff className="size-6" aria-hidden="true" />
          <span className="px-4 text-center text-xs">Photo unavailable</span>
        </div>
      ) : (
        <img
          src={image.src}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          alt={altText}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-500',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      )}
    </div>
  )
}
