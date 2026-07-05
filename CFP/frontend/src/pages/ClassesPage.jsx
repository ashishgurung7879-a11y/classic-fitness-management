import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicPageShell from '../components/PublicPageShell';
import PageHero from '../components/PageHero';
import ClassesSection from '../sections/ClassesSection';
import BMISection from '../sections/BMISection';
import NutritionSection from '../sections/NutritionSection';
import BookingModal from '../modals/BookingModal';
import { publicApi } from '../utils/api';

export default function ClassesPage() {
  const navigate = useNavigate();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingClass, setBookingClass] = useState('');
  const [schedulePreview, setSchedulePreview] = useState([]);

  useEffect(() => {
    let cancelled = false;

    publicApi('/classes').then(({ ok, data }) => {
      if (cancelled || !ok) return;
      const classes = Array.isArray(data.classes) ? data.classes : [];
      setSchedulePreview(classes.filter((item) => item?.schedule?.startTime).slice(0, 3));
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
        aside={schedulePreview.length > 0 ? (
          <div className="page-schedule-card">
            <span className="page-spotlight-kicker">Scheduled Classes</span>
            <div className="page-schedule-list">
              {schedulePreview.map((item) => (
                <div key={item._id || item.id || item.name}>
                  <strong>{item.name || item.title || 'Class'}</strong>
                  <span>{[item.schedule?.startTime, item.schedule?.endTime].filter(Boolean).join(' - ')}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      />
      <ClassesSection onBook={openBooking} />
      <BMISection />
      <NutritionSection />
      {bookingOpen && <BookingModal className={bookingClass} onClose={() => setBookingOpen(false)} />}
    </PublicPageShell>
  );
}
