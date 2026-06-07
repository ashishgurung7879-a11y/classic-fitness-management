import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicPageShell from '../components/PublicPageShell';
import PageHero from '../components/PageHero';
import ClassesSection from '../sections/ClassesSection';
import BMISection from '../sections/BMISection';
import NutritionSection from '../sections/NutritionSection';
import BookingModal from '../modals/BookingModal';

export default function ClassesPage() {
  const navigate = useNavigate();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingClass, setBookingClass] = useState('');

  function openBooking(className) {
    setBookingClass(className);
    setBookingOpen(true);
  }

  return (
    <PublicPageShell
      pageClass="page-classes"
      title="Classes | Classic Fitness Park"
      description="Explore training classes, coaching options, BMI support, and nutrition guidance at Classic Fitness Park."
    >
      <PageHero
        eyebrow="Classes And Coaching"
        title={<>Train Smarter Across Multiple Programs</>}
        description="Browse group classes, check your fitness baseline, and choose training tracks that match your goals."
        theme="velocity"
        actions={[
          { label: 'Meet Trainers', variant: 'btn-red', onClick: () => navigate('/trainers') },
          { label: 'Join The Gym', variant: 'btn-outline', onClick: () => navigate('/membership') },
        ]}
        highlights={[
          { label: 'Weekly Rhythm', value: '20+ Sessions', note: 'Strength, cardio, mobility and more.' },
          { label: 'Best For', value: 'All Levels', note: 'From beginners to serious athletes.' },
        ]}
        aside={(
          <div className="page-schedule-card">
            <span className="page-spotlight-kicker">Popular Blocks</span>
            <div className="page-schedule-list">
              <div><strong>Morning Power</strong><span>6:00 AM - 8:00 AM</span></div>
              <div><strong>Midday Conditioning</strong><span>10:00 AM - 11:00 AM</span></div>
              <div><strong>Evening Burn</strong><span>5:00 PM - 7:00 PM</span></div>
            </div>
          </div>
        )}
      />
      <ClassesSection onBook={openBooking} />
      <BMISection />
      <NutritionSection />
      {bookingOpen && <BookingModal className={bookingClass} onClose={() => setBookingOpen(false)} />}
    </PublicPageShell>
  );
}
