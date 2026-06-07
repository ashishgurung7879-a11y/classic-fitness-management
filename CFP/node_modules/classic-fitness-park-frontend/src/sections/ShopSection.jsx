import React, { useEffect, useState } from 'react';
import { publicApi } from '../utils/api';

const PRODUCT_CACHE_KEY = 'cfp_shop_products_cache';

const DEFAULTS = [
  { _id: 'p1', name: 'Whey Protein Gold', emoji: 'WP', category: 'protein', description: '2kg • 25g protein/serving', price: 4200, salePrice: 3500, badge: 'best', rating: { avg: 5, count: 124 }, stock: 15 },
  { _id: 'p2', name: 'Mass Gainer Pro', emoji: 'MG', category: 'protein', description: '3kg • 1200 kcal/serving', price: 5500, salePrice: 4800, badge: 'new', rating: { avg: 4, count: 87 }, stock: 8 },
  { _id: 'p3', name: 'BCAA Recovery', emoji: 'BC', category: 'vitamins', description: '300g • Tropical flavor', price: 2800, salePrice: 2200, badge: 'hot', rating: { avg: 5, count: 98 }, stock: 20 },
  { _id: 'p4', name: 'Creatine Monohydrate', emoji: 'CR', category: 'vitamins', description: '500g • Increases strength', price: 1800, salePrice: null, badge: '', rating: { avg: 4, count: 65 }, stock: 12 },
  { _id: 'p5', name: 'Lifting Gloves Pro', emoji: 'LG', category: 'gear', description: 'Anti-slip • Full wrist support', price: 850, salePrice: null, badge: '', rating: { avg: 5, count: 56 }, stock: 25 },
  { _id: 'p6', name: 'Resistance Bands Set', emoji: 'RB', category: 'gear', description: '5 levels • Premium latex', price: 1200, salePrice: null, badge: '', rating: { avg: 4, count: 43 }, stock: 18 },
  { _id: 'p7', name: 'Gym Bag Pro', emoji: 'GB', category: 'gear', description: 'Large • Waterproof', price: 2500, salePrice: 1999, badge: 'sale', rating: { avg: 4, count: 31 }, stock: 6 },
  { _id: 'p8', name: 'CFP Training Tee', emoji: 'TT', category: 'apparel', description: 'Dri-fit • CFP logo', price: 950, salePrice: null, badge: '', rating: { avg: 4, count: 34 }, stock: 30 },
];

const CATS = ['all', 'protein', 'vitamins', 'gear', 'apparel', 'drinks', 'other'];
const stars = (value) => '★'.repeat(Math.floor(value)) + '☆'.repeat(5 - Math.floor(value));
const discount = (product) => (product.salePrice ? Math.round((1 - product.salePrice / product.price) * 100) : 0);

function readCachedProducts() {
  try {
    const cached = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || '[]');
    const activeCachedProducts = Array.isArray(cached)
      ? cached.filter((product) => product?.isActive !== false)
      : [];
    return activeCachedProducts.length ? activeCachedProducts : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export default function ShopSection({ onAddToCart, onOpenCart, cart }) {
  const [products, setProducts] = useState(readCachedProducts);
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [apiLoaded, setApiLoaded] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      console.debug('[ShopSection] requesting public products');
      const { ok, data, status } = await publicApi('/products');
      if (cancelled) return;

      if (!ok) {
        console.error('[ShopSection] failed to load products', { status, message: data?.message, data });
        setApiLoaded(false);
        setApiError(true);
        return;
      }

      const fetchedProducts = Array.isArray(data.products) ? data.products : [];
      const visibleProducts = fetchedProducts.filter((product) => product?.isActive !== false);

      if (visibleProducts.length !== fetchedProducts.length) {
        console.warn('[ShopSection] filtered out products that were hidden/inactive', {
          fetched: fetchedProducts.length,
          visible: visibleProducts.length,
        });
      }

      console.debug('[ShopSection] products ready for homepage', visibleProducts);
      setProducts(visibleProducts);

      try {
        localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(visibleProducts));
      } catch {
        localStorage.removeItem(PRODUCT_CACHE_KEY);
      }

      setApiLoaded(true);
      setApiError(false);
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = products.filter((product) =>
    (cat === 'all' || (product?.category || 'other') === cat) &&
    (
      String(product?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      String(product?.description || '').toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);

  return (
    <section className="shop" id="shop">
      <div className="container">
        <div className="section-header">
          <div className="section-label">SUPPLEMENT STORE</div>
          <h2 className="section-title">CFP <span className="gold">Shop</span></h2>
          <p>Premium supplements and gear right at the gym</p>
        </div>

        <div className="shop-controls">
          <div className="cat-filters">
            {CATS.map((category) => (
              <button key={category} type="button" className={`filter-btn${cat === category ? ' active' : ''}`} onClick={() => setCat(category)}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>

          <div className="shop-tools">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products..."
              className="shop-search-input"
            />
            <button type="button" className="btn-red shop-cart-button" onClick={onOpenCart}>
              Cart
              {totalQty > 0 ? <span className="cart-count">{totalQty}</span> : null}
            </button>
          </div>
        </div>

        {apiError ? <p className="shop-note">Showing saved shop products. Start the backend to load the latest admin products.</p> : null}

        <div className="products-grid" id="productsGrid">
          {apiLoaded && products.length === 0 ? (
            <div className="shop-empty">No active products are available right now.</div>
          ) : filtered.length === 0 ? (
            <div className="shop-empty">No products found.</div>
          ) : filtered.map((product) => {
            const productName = String(product?.name || 'Untitled product').trim() || 'Untitled product';
            const price = product.salePrice != null ? product.salePrice : product.price;
            const off = discount(product);
            const outOfStock = Number(product.stock ?? 0) <= 0;

            return (
              <article key={product._id} className="product-card visible">
                <div className="product-img">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={productName} />
                  ) : (
                    <div className="prod-emoji">{product.emoji || 'PR'}</div>
                  )}
                  {product.badge ? <span className={`prod-badge ${product.badge}`}>{product.badge.toUpperCase()}</span> : null}
                  {off > 0 ? <span className="prod-disc">{off}% OFF</span> : null}
                </div>

                <div className="prod-body">
                  <div className="prod-cat">{product.category}</div>
                  <div className="prod-name">{productName}</div>
                  <div className="prod-desc">{product.description}</div>
                  <div className="prod-stars">{stars(product.rating?.avg || 4)} <small>({product.rating?.count || 0})</small></div>
                  <div className="prod-price-row">
                    <span className="price-new">Rs. {price.toLocaleString()}</span>
                    {product.salePrice ? <span className="price-old">Rs. {product.price.toLocaleString()}</span> : null}
                  </div>
                  <button type="button" className="btn-add" disabled={outOfStock} onClick={() => !outOfStock && onAddToCart(productName, price, product._id)}>
                    {outOfStock ? 'OUT OF STOCK' : 'ADD TO CART'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
