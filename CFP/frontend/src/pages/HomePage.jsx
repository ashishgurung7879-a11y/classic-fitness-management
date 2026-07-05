import React, { useEffect, useState } from 'react';
import FloatingActions from '../components/FloatingActions';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';
import SiteMeta from '../components/SiteMeta';
import { useToast } from '../context/ToastContext';
import BookingModal from '../modals/BookingModal';
import CartModal from '../modals/CartModal';
import PaymentModal from '../modals/PaymentModal';
import AboutSection from '../sections/AboutSection';
import BMISection from '../sections/BMISection';
import ClassesSection from '../sections/ClassesSection';
import ContactSection from '../sections/ContactSection';
import GallerySection from '../sections/GallerySection';
import HeroSection from '../sections/HeroSection';
import MembershipSection from '../sections/MembershipSection';
import NoticeBoard from '../sections/NoticeBoard';
import NutritionSection from '../sections/NutritionSection';
import ShopSection from '../sections/ShopSection';
import TrainersSection from '../sections/TrainersSection';
import { publicApi } from '../utils/api';

const CART_STORAGE_KEY = 'cfp_cart';

function readCart() {
  try {
    const cached = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
}

export default function HomePage() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingClass, setBookingClass] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState({ plan: '', amount: 0 });
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(readCart);
  const [stats, setStats] = useState({
    members: 0,
    trainers: 0,
    classes: 0,
  });
  const [heroGallery, setHeroGallery] = useState([]);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    publicApi('/dashboard/public').then(({ ok, data }) => {
      if (cancelled) return;
      if (ok && data.stats) {
        setStats((current) => ({
          ...current,
          members: data.stats.members ?? 0,
          trainers: data.stats.trainers ?? 0,
        }));
      }
    });

    publicApi('/classes').then(({ ok, data }) => {
      if (cancelled || !ok) return;
      setStats((current) => ({
        ...current,
        classes: Array.isArray(data.classes) ? data.classes.length : 0,
      }));
    });

    publicApi('/gallery').then(({ ok, data }) => {
      if (cancelled || !ok) return;
      const photos = Array.isArray(data.photos) ? data.photos : [];
      setHeroGallery(photos.slice(0, 3));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const openBooking = (className) => {
    setBookingClass(className);
    setBookingOpen(true);
  };

  const openPayment = (plan, amount) => {
    setPaymentPlan({ plan, amount });
    setPaymentOpen(true);
  };

  const addToCart = (name, price, id) => {
    setCart((current) => {
      const existing = current.find((item) => item.name === name);
      if (existing) {
        return current.map((item) => (item.name === name ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...current, { name, price, qty: 1, id }];
    });
    showToast(`Added ${name} to cart.`);
  };

  return (
    <>
      <SiteMeta
        title="Classic Fitness Park | Gym In Kakarvitta, Jhapa"
        description="Train at Classic Fitness Park with memberships, classes, trainers, supplements, and online member support from one modern website."
      />
      <Navbar />

      <main>
        <HeroSection stats={stats} galleryPreview={heroGallery} />
        <AboutSection />
        <ClassesSection onBook={openBooking} />
        <BMISection />
        <NutritionSection />
        <NoticeBoard />
        <MembershipSection onPay={openPayment} />
        <TrainersSection onBook={openBooking} />
        <GallerySection />
        <ShopSection onAddToCart={addToCart} onOpenCart={() => setCartOpen(true)} cart={cart} />
        <ContactSection />
      </main>

      <Footer />
      <FloatingActions />

      {bookingOpen ? <BookingModal className={bookingClass} onClose={() => setBookingOpen(false)} /> : null}
      {paymentOpen ? <PaymentModal plan={paymentPlan.plan} amount={paymentPlan.amount} onClose={() => setPaymentOpen(false)} /> : null}
      {cartOpen ? <CartModal cart={cart} setCart={setCart} onClose={() => setCartOpen(false)} /> : null}
    </>
  );
}
