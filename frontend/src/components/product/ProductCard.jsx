import { Link } from 'react-router-dom'
import { getProductImage } from '@/lib/images'
import { imageRef, productPath } from '@/lib/product'
import { Price } from './Price'
import { ProductBadges } from './ProductBadges'
import { WishlistButton } from './WishlistButton'

/** `preferredColours`: colour names to show first (e.g. the active colour filter). */
export function ProductCard({ product, preferredColours = [] }) {
  const colour = product.colours.find((c) => preferredColours.includes(c.name))
  const ref = imageRef(product, colour)
  const front = getProductImage(ref, 'front')
  const back = getProductImage(ref, 'back')

  return (
    <article className="group relative flex h-full flex-col bg-bg">
      <div className="relative aspect-[3/4] overflow-hidden bg-surface">
        <img
          src={front.src}
          alt={front.alt}
          loading="lazy"
          className="absolute inset-0 size-full object-contain p-[8%] transition-opacity duration-300 group-hover:opacity-0"
        />
        <img
          src={back.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 size-full object-contain p-[8%] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1">
          <ProductBadges product={product} />
        </div>
        <WishlistButton
          productId={product.id}
          productName={product.name}
          className="absolute top-1 right-1 z-20"
        />
      </div>
      <div className="relative flex flex-1 flex-col gap-1 px-2.5 pt-2.5 pb-5 before:absolute before:top-0 before:left-0 before:h-0.5 before:w-10 before:bg-ink sm:px-3 sm:pb-6 md:before:hidden">
        <h3 className="text-2xs leading-snug uppercase sm:text-xs">
          <Link
            to={productPath(product, colour)}
            className="after:absolute after:inset-0 after:z-10 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ink"
          >
            {product.name}
          </Link>
        </h3>
        <Price
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          className="text-2xs sm:text-xs"
        />
      </div>
    </article>
  )
}
