import { cn } from '@/lib/cn'
import { gridColumns } from './gridColumns'
import { ProductCard } from './ProductCard'

/** Edge-to-edge grid with hairline separators (gap + line background). */
export function ProductGrid({ products, columns = 'full', className, preferredColours }) {
  return (
    <ul className={cn(gridColumns[columns], className)}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} preferredColours={preferredColours} />
        </li>
      ))}
    </ul>
  )
}
