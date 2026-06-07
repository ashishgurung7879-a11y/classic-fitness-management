import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi } from '../utils/api';

export default function TrainersSection({ onBook }) {
  const [trainers, setTrainers] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainers() {
      console.debug('[TrainersSection] requesting approved trainers');
      const { ok, data, status } = await publicApi('/trainers');
      if (cancelled) return;

      if (!ok) {
        console.error('[TrainersSection] failed to load trainers', { status, message: data?.message, data });
        setTrainers([]);
        return;
      }

      const fetchedTrainers = Array.isArray(data.trainers) ? data.trainers : [];
      const visibleTrainers = fetchedTrainers.filter(
        (trainer) => trainer?.trainerProfile?.applicationStatus === 'approved' && trainer?.isActive !== false,
      );

      if (visibleTrainers.length !== fetchedTrainers.length) {
        console.warn('[TrainersSection] filtered out trainers that were not approved/active', {
          fetched: fetchedTrainers.length,
          visible: visibleTrainers.length,
        });
      }

      console.debug('[TrainersSection] trainers ready for homepage', visibleTrainers);
      setTrainers(visibleTrainers);
    }

    loadTrainers();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="trainers" id="trainers">
      <div className="container">
        <div className="section-header">
          <div className="section-label">MEET THE TEAM</div>
          <h2 className="section-title">Expert <span className="gold">Trainers</span></h2>
          <p>Certified professionals dedicated to your transformation and verified by our admin team.</p>
        </div>

        <div className="trainers-grid" id="trainersGrid">
          {trainers === null ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--gray-light)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.8rem' }}>...</div>
              <div>Loading trainers...</div>
            </div>
          ) : trainers.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--gray-light)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>GYM</div>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.4rem', marginBottom: '0.5rem' }}>No Trainers Yet</div>
              <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>Be the first to join our team.</p>
              <Link to="/contact?type=Trainer%20Application" className="btn-red" style={{ padding: '0.7rem 1.5rem' }}>
                Apply as Trainer
              </Link>
            </div>
          ) : trainers.map((trainer) => {
            const firstName = String(trainer?.firstName || 'Trainer').trim() || 'Trainer';
            const lastName = String(trainer?.lastName || '').trim();
            const initials = ((firstName[0] || 'T') + (lastName[0] || '')).toUpperCase();
            const specialities = trainer.trainerProfile?.specialities || [];
            const experience = trainer.trainerProfile?.experience || 0;

            return (
              <div key={trainer._id} className="trainer-card visible">
                <div className="trainer-img">
                  {trainer.photo && trainer.photo.length > 50 ? (
                    <img
                      src={trainer.photo}
                      alt={`${firstName} ${lastName}`.trim()}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        objectPosition: 'center',
                        background: 'linear-gradient(180deg,#f7f7f9 0%,#ffffff 100%)',
                        padding: '0.6rem',
                      }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '200px', background: 'linear-gradient(135deg,var(--gold-dark),var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue'", fontSize: '4rem', color: 'rgba(255,255,255,0.3)' }}>
                      {initials}
                    </div>
                  )}
                  <div className="trainer-overlay">
                    <button
                      className="btn-red"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.82rem', border: 'none', cursor: 'pointer' }}
                      onClick={() => onBook(`Personal Training with ${firstName}`)}
                    >
                      Book Session
                    </button>
                  </div>
                </div>
                <div className="trainer-info">
                  <h3>{firstName} {lastName}</h3>
                  <span className="trainer-role">{trainer.trainerProfile?.bio?.substring(0, 50) || 'Personal Trainer'}</span>
                  <div className="trainer-specialties">
                    {specialities.slice(0, 3).map((speciality) => <span key={speciality}>{speciality}</span>)}
                  </div>
                  <div className="trainer-exp">{experience > 0 ? `${experience} Years Experience` : 'New Trainer'}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: '3rem', padding: '2rem', background: 'var(--dark)', borderRadius: '16px', border: '1px solid rgba(204,0,0,0.15)' }}>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.5rem', marginBottom: '0.5rem' }}>Are You a Fitness Professional?</div>
          <p style={{ color: 'var(--gray-light)', fontSize: '0.9rem', marginBottom: '1.2rem' }}>Apply to join our team as a certified trainer at Classic Fitness Park.</p>
          <Link to="/contact?type=Trainer%20Application" className="btn-red">
            Apply as Trainer
          </Link>
        </div>
      </div>
    </section>
  );
}
