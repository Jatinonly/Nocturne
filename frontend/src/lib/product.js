export function isInStock(product) {
  return Object.values(product.stock).some((units) => units > 0)
}

export function totalStock(product) {
  return Object.values(product.stock).reduce((sum, units) => sum + units, 0)
}

export function imageRef(product, colour) {
  return {
    id: product.id,
    name: product.name,
    silhouette: product.silhouette,
    colourHex: (colour ?? product.colours[0]).hex,
  }
}

/** Adds `?colour=` when a non-default colour should be preselected on the detail page. */
export function productPath(product, colour) {
  const path = `/product/${product.slug}`
  return colour && colour.name !== product.colours[0]?.name
    ? `${path}?colour=${encodeURIComponent(colour.name)}`
    : path
}
