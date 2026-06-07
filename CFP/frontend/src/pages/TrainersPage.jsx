import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicPageShell from '../components/PublicPageShell';
import PageHero from '../components/PageHero';
import TrainersSection from '../sections/TrainersSection';
import BookingModal from '../modals/BookingModal';

export default function TrainersPage() {
  const navigate = useNavigate();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingClass, setBookingClass] = useState('');

  function openBooking(className) {
    setBookingClass(className);
    setBookingOpen(true);
  }

  return (
    <PublicPageShell
      title="Trainers | Classic Fitness Park"
      description="Meet the trainer team at Classic Fitness Park and book coaching sessions through the website."
    >
      <PageHero
        eyebrow="Trainer Team"
        title={<>Work With Coaches Who Know The Floor</>}
        description="See approved trainers from the MERN backend and book private coaching sessions through the website."
        actions={[
          { label: 'Book A Session', variant: 'btn-red', onClick: () => openBooking('Personal Training Session') },
          { label: 'Apply As Trainer', variant: 'btn-outline', onClick: () => navigate('/contact') },
        ]}
      />
      <TrainersSection onBook={openBooking} />
      {bookingOpen && <BookingModal className={bookingClass} onClose={() => setBookingOpen(false)} />}
    </PublicPageShell>
  );
}
