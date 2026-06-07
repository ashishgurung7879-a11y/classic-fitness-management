import React from 'react';
import { useNavigate } from 'react-router-dom';
import PublicPageShell from '../components/PublicPageShell';
import PageHero from '../components/PageHero';
import ContactSection from '../sections/ContactSection';

export default function ContactPage() {
  const navigate = useNavigate();

  return (
    <PublicPageShell
      title="Contact Classic Fitness Park"
      description="Contact Classic Fitness Park, find the gym location, and send enquiries about memberships, trainers, or visits."
    >
      <PageHero
        eyebrow="Contact And Visit"
        title={<>Reach The Gym, Book A Visit, Or Ask A Question</>}
        description="Send a message, find the gym, and jump into the member, trainer, or admin experience from one place."
        actions={[
          { label: 'See Membership Plans', variant: 'btn-red', onClick: () => navigate('/membership') },
          { label: 'Meet Trainers', variant: 'btn-outline', onClick: () => navigate('/trainers') },
        ]}
      />
      <ContactSection />
    </PublicPageShell>
  );
}
