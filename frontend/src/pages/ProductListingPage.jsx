import { SearchX, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { ActiveFilters } from '@/components/product/ActiveFilters'
import { FilterDrawer } from '@/components/product/FilterDrawer'
import { FilterPanel } from '@/components/product/FilterPanel'
import { ProductGrid } from '@/components/product/ProductGrid'
import { ProductGridSkeleton } from '@/components/product/ProductGridSkeleton'
import { SortSelect } from '@/components/product/SortSelect'
import { SubcategoryTabs } from '@/components/product/SubcategoryTabs'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { CATEGORIES, isCollectionSlug } from '@/data/categories'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useQuery } from '@/hooks/useQuery'
import { cn } from '@/lib/cn'
import { pluralize } from '@/lib/format'
import { productService } from '@/services/productService'
import { selectActiveFilterCount, useFilterStore } from '@/store/filterStore'
import NotFoundPage from './NotFoundPage'

export default function ProductListingPage() {
  const { collection: collectionParam } = useParams()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const isSearch = pathname === '/search'
  const collection = isSearch ? 'all' : collectionParam
  const search = searchParams.get('q')?.trim() || undefined
  const subcategory = searchParams.get('type') ?? undefined

  const filters = useFilterStore()
  const resetFilters = useFilterStore((state) => state.reset)
  const activeFilterCount = selectActiveFilterCount(filters)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Filters belong to a collection — start fresh when switching.
  useEffect(() => {
    resetFilters()
  }, [collection, search, resetFilters])

  const valid = isCollectionSlug(collection)
  const category = valid ? CATEGORIES[collection] : undefined
  const title = isSearch ? (search ? `Results for “${search}”` : 'Search') : category?.label

  useDocumentTitle(title)

  const query = valid
    ? {
        collection,
        subcategory,
        search,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        sizes: filters.sizes,
        colours: filters.colours,
        inStockOnly: filters.inStockOnly,
        sort: filters.sort,
      }
    : null

  const { data, loading, error } = useQuery(
    query ? JSON.stringify(query) : null,
    () => productService.listProducts(query),
    { keepPreviousData: true },
  )

  if (!valid || !category) return <NotFoundPage />

  const basePath = isSearch ? '/search' : `/shop/${collection}`

  return (
    <>
      <Breadcrumbs
        items={[
          { label: isSearch ? 'Search' : category.label, to: basePath },
          ...(subcategory ? [{ label: subcategory }] : []),
        ]}
      />
      <header className="px-3 pt-2 pb-5 sm:px-4 sm:pb-8">
        <h1 className="text-3xl font-medium tracking-tight uppercase sm:text-5xl">
          {subcategory ?? title}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          {isSearch ? 'Search across all categories.' : category.description}
        </p>
      </header>

      {data && (
        <SubcategoryTabs
          basePath={basePath}
          subcategories={data.facets.subcategories}
          active={subcategory}
          search={search}
        />
      )}

      <div className="sticky top-14 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg px-3 py-2 sm:top-16 sm:px-4">
        <p className="label text-muted" aria-live="polite">
          {data ? pluralize(data.total, 'item') : 'Loading…'}
        </p>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <SortSelect />
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-9 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Filter
            {activeFilterCount > 0 && <span className="font-mono">({activeFilterCount})</span>}
          </Button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[260px_1fr]">
        <aside aria-label="Filters" className="hidden border-r border-line lg:block">
          <div className="sticky top-[7.5rem] max-h-[calc(100dvh-7.5rem)] overflow-y-auto">
            {data && <FilterPanel facets={data.facets} />}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="pt-3">
            <ActiveFilters />
          </div>
          {error ? (
            <EmptyState icon={SearchX} title="Something went wrong" description={error.message} />
          ) : !data ? (
            <ProductGridSkeleton count={8} columns="withSidebar" />
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No results"
              description={
                search
                  ? `We couldn't find anything for “${search}”. Try a different term or fewer filters.`
                  : 'No products match these filters. Try removing a few.'
              }
              action={
                activeFilterCount > 0 && (
                  <Button variant="dark" onClick={resetFilters}>
                    Clear filters
                  </Button>
                )
              }
            />
          ) : (
            <div className={cn('transition-opacity', loading && 'opacity-50')} aria-busy={loading}>
              <ProductGrid
                products={data.items}
                columns="withSidebar"
                preferredColours={filters.colours}
              />
            </div>
          )}
        </div>
      </div>

      {data && (
        <FilterDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          facets={data.facets}
          resultCount={data.total}
        />
      )}
    </>
  )
}
