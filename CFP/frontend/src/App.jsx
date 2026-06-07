import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Loader from './components/Loader';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ClassesPage = lazy(() => import('./pages/ClassesPage'));
const MembershipPage = lazy(() => import('./pages/MembershipPage'));
const TrainersPage = lazy(() => import('./pages/TrainersPage'));
const ShopPage = lazy(() => import('./pages/ShopPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const MemberPortal = lazy(() => import('./pages/MemberPortal'));
const AdminPortal = lazy(() => import('./pages/AdminPortal'));
const TrainerPortal = lazy(() => import('./pages/TrainerPortal'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));

export default function App() {
  return (
    <Suspense fallback={<Loader hidden={false} />}>
      <Routes>
        <Route path="/"         element={<HomePage />} />
        <Route path="/about"    element={<AboutPage />} />
        <Route path="/classes"  element={<ClassesPage />} />
        <Route path="/membership" element={<MembershipPage />} />
        <Route path="/trainers" element={<TrainersPage />} />
        <Route path="/shop"     element={<ShopPage />} />
        <Route path="/contact"  element={<ContactPage />} />
        <Route path="/member"   element={<MemberPortal />} />
        <Route path="/admin"    element={<AdminPortal />} />
        <Route path="/trainer"  element={<TrainerPortal />} />
        <Route path="/payment"  element={<PaymentPage />} />
        {/* Legacy .html URLs */}
        <Route path="/member.html"  element={<MemberPortal />} />
        <Route path="/admin.html"   element={<AdminPortal />} />
        <Route path="/trainer.html" element={<TrainerPortal />} />
        <Route path="/payment.html" element={<PaymentPage />} />
        <Route path="*"         element={<HomePage />} />
      </Routes>
    </Suspense>
  );
}
