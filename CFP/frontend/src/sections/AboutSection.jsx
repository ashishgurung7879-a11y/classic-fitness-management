import React from 'react';
import { Link } from 'react-router-dom';

export default function AboutSection() {
  return (
    <section className="about" id="about">
      <div className="container">
        <div className="about-grid">

          {/* Photo collage */}
          <div className="about-visual">
            <div className="about-img-main about-img-frame">
              <img src="gym-photos/gym-08.jpeg" alt="Classic Fitness Park" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
              <div className="about-badge-float">
                <span className="badge-year">EST.</span>
                <span className="badge-num">2074</span>
              </div>
            </div>
            <div className="about-photo-stack">
              <img src="gym-photos/gym-02.jpeg" alt="Equipment lineup" />
              <img src="gym-photos/gym-06.jpeg" alt="Community event" />
              <img src="gym-photos/gym-11.jpeg" alt="Supplement counter" />
            </div>
          </div>

          {/* Content */}
          <div className="about-content">
            <div className="section-label">ABOUT US</div>
            <h2 className="section-title">Kakarvitta's Most <span className="gold">Powerful</span> Gym</h2>
            <p style={{ color:'var(--gray-light)', marginBottom:'1.5rem', lineHeight:1.8 }}>
              Classic Fitness Park has been transforming lives in Jhapa since 2019. We combine cutting-edge equipment with expert coaching to deliver results that last a lifetime.
            </p>

            <div className="about-proof-grid">
              <div className="about-proof-card">
                <span className="proof-kicker">Real Equipment</span>
                <strong>Dedicated cardio, strength and machine zones</strong>
              </div>
              <div className="about-proof-card">
                <span className="proof-kicker">Real Community</span>
                <strong>Members, events and coaching inside the actual gym</strong>
              </div>
            </div>

            <div className="about-features">
              {[
                { icon:'EQ', title:'Premium Equipment', desc:'50+ machines and free weights from leading brands' },
                { icon:'PRO', title:'Certified Trainers', desc:'Internationally certified personal trainers, all verified by admin' },
                { icon:'HRS', title:'Open 5AM - 9PM', desc:'Sunday-Friday. Break: 11AM-2PM. Closed Saturday.' },
                { icon:'MAP', title:'Location', desc:'Kakarvitta, Mechinagar 06, Jhapa, Province No. 1' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="feature-item">
                  <div className="feature-icon">{icon}</div>
                  <div>
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link to="/membership" className="btn-red">
              Explore Membership
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}
