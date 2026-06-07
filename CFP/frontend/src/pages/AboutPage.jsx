import React from 'react';
import { useNavigate } from 'react-router-dom';
import PublicPageShell from '../components/PublicPageShell';
import PageHero from '../components/PageHero';
import AboutSection from '../sections/AboutSection';
import GallerySection from '../sections/GallerySection';

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <PublicPageShell
      pageClass="page-about"
      title="About Classic Fitness Park | Kakarvitta, Jhapa"
      description="Learn about Classic Fitness Park, see the gym environment, and explore the training culture built for Kakarvitta."
    >
      <PageHero
        eyebrow="About Classic Fitness Park"
        title={<>Built In Jhapa For Real Results</>}
        description="Explore the gym, the team, and the training environment that powers Classic Fitness Park in Kakarvitta."
        theme="sunrise"
        actions={[
          { label: 'View Membership', variant: 'btn-red', onClick: () => navigate('/membership') },
          { label: 'Contact The Gym', variant: 'btn-outline', onClick: () => navigate('/contact') },
        ]}
        highlights={[
          { label: 'Founded', value: '2019', note: 'Serving Kakarvitta since day one.' },
          { label: 'Focus', value: 'Strength + Community', note: 'Built for progress that lasts.' },
        ]}
        aside={(
          <div className="page-spotlight">
            <span className="page-spotlight-kicker">Facility Snapshot</span>
            <div className="page-spotlight-stack">
              <img src="/gym-photos/gym-08.jpeg" alt="Gym floor" />
              <img src="/gym-photos/gym-02.jpeg" alt="Equipment zone" />
            </div>
          </div>
        )}
      />
      <AboutSection />
      <GallerySection />
    </PublicPageShell>
  );
}
