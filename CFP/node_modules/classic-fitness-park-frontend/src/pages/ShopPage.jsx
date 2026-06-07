import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicPageShell from '../components/PublicPageShell';
import PageHero from '../components/PageHero';
import { useToast } from '../context/ToastContext';
import CartModal from '../modals/CartModal';
import ShopSection from '../sections/ShopSection';

const CART_STORAGE_KEY = 'cfp_cart';

function readCart() {
  try {
    const cached = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
}

export default function ShopPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(readCart);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  function addToCart(name, price, id) {
    setCart((current) => {
      const existing = current.find((item) => item.name === name);
      if (existing) {
        return current.map((item) => (item.name === name ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...current, { name, price, qty: 1, id }];
    });

    showToast(`Added ${name} to cart.`);
  }

  return (
    <PublicPageShell
      title="Gym Shop | Classic Fitness Park"
      description="Shop supplements, apparel, and gym gear from the Classic Fitness Park product catalog."
    >
      <PageHero
        eyebrow="Supplements And Gear"
        title={<>Shop Products From The Gym Store</>}
        description="Browse proteins, vitamins, apparel, and gear "
        actions={[
          { label: 'Open Cart', variant: 'btn-red', onClick: () => setCartOpen(true) },
          { label: 'View Membership', variant: 'btn-outline', onClick: () => navigate('/membership') },
        ]}
      />
      <ShopSection onAddToCart={addToCart} onOpenCart={() => setCartOpen(true)} cart={cart} />
      {cartOpen ? <CartModal cart={cart} setCart={setCart} onClose={() => setCartOpen(false)} /> : null}
    </PublicPageShell>
  );
}
