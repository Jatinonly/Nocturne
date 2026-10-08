import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { ProductCarousel } from '@/components/product/ProductCarousel'
import { ProductGallery } from '@/components/product/ProductGallery'
import { PurchasePanel } from '@/components/product/PurchasePanel'
import { Skeleton } from '@/components/ui/Skeleton'
import { CATEGORIES } from '@/data/categories'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useQuery } from '@/hooks/useQuery'
import { getProductImages } from '@/lib/images'
import { imageRef } from '@/lib/product'
import { productService } from '@/services/productService'
import NotFoundPage from './NotFoundPage'

function ProductDetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading product"
      className="grid gap-6 px-3 py-4 sm:px-4 md:grid-cols-[1.4fr_1fr] md:gap-10"
    >
      <Skeleton className="aspect-[3/4]" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

function ProductView({ product }) {
  const [searchParams] = useSearchParams()
  const [colour, setColour] = useState(
    () => product.colours.find((c) => c.name === searchParams.get('colour')) ?? product.colours[0],
  )
  const images = getProductImages(imageRef(product, colour))
  const category = CATEGORIES[product.category]
  const { data: related } = useQuery(`related:${product.id}`, () =>
    productService.getRelatedProducts(product),
  )

  return (
    <>
      <Breadcrumbs
        items={[
          { label: category.label, to: `/shop/${product.category}` },
          {
            label: product.subcategory,
            to: `/shop/${product.category}?type=${encodeURIComponent(product.subcategory)}`,
          },
          { label: product.name },
        ]}
      />
      <div className="md:grid md:grid-cols-[1.4fr_1fr] md:gap-8 md:px-4 lg:gap-12">
        <ProductGallery key={colour.name} images={images} />
        <div className="md:sticky md:top-24 md:self-start md:pb-10">
          <PurchasePanel product={product} colour={colour} onColourChange={setColour} />
        </div>
      </div>
      <div className="mt-10">
        {related ? (
          <ProductCarousel title="Related products" products={related} />
        ) : (
          <Skeleton className="mx-4 h-80" />
        )}
      </div>
    </>
  )
}

export default function ProductDetailPage() {
  const { slug = '' } = useParams()
  const { data: product, loading } = useQuery(`product:${slug}`, () =>
    productService.getProductBySlug(slug),
  )
  useDocumentTitle(product?.name)

  if (loading) return <ProductDetailSkeleton />
  if (!product) return <NotFoundPage />
  // `key` resets selection state when navigating between products.
  return <ProductView key={product.id} product={product} />
}
