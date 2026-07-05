import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HeroSection({ stats, galleryPreview = [] }) {
  const particlesRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const container = particlesRef.current;
    if (!container) return;
    container.innerHTML = '';
    for (let index = 0; index < 25; index += 1) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.cssText = `left:${Math.random() * 100}%;width:${Math.random() * 3 + 1}px;height:${Math.random() * 3 + 1}px;animation-duration:${Math.random() * 15 + 8}s;animation-delay:${Math.random() * 8}s;`;
      container.appendChild(particle);
    }
  }, []);

  return (
    <section className="hero" id="home">
      <div className="hero-bg">
        <div className="hero-overlay"></div>
        <div id="particles" ref={particlesRef}></div>
        <div className="hero-mesh"></div>
      </div>

      <div className="hero-content">
        <div className="hero-badge">
          <span className="badge-dot"></span>NOW OPEN - KAKARVITTA, MECHINAGAR 06, JHAPA
        </div>

        <h1 className="hero-title">
          <span className="hero-line">FORGE YOUR</span>
          <span className="hero-line gold">ULTIMATE</span>
          <span className="hero-line">BODY</span>
        </h1>

        <p className="hero-sub">
          Nepal&apos;s premier fitness destination. State-of-the-art equipment, certified trainers, and a community that pushes you beyond limits.
        </p>

        <div className="hero-cta">
          <button className="btn-red btn-large" onClick={() => navigate('/membership')}>Start Today</button>
          <button className="btn-ghost btn-large" onClick={() => navigate('/classes')}>
            View Classes
          </button>
        </div>

        <div className="hero-stats">
          <StatItem value={stats.members} label="Members" />
          <div className="stat-div"></div>
          <StatItem value={stats.trainers} label="Trainers" />
          <div className="stat-div"></div>
          <StatItem value={stats.classes} label="Classes" />
        </div>

        {galleryPreview.length > 0 ? (
          <div className="hero-real-strip">
            {galleryPreview.map((photo, index) => {
              const title = photo.title || `Gallery photo ${index + 1}`;
              return (
                <article key={photo._id || photo.id || photo.imageUrl || title} className="hero-real-card">
                  <img src={photo.imageUrl} alt={title} />
                  <div className="hero-real-copy">
                    <strong>{title}</strong>
                    {photo.category ? <span>{photo.category}</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="hero-scroll">
        <span>Scroll</span>
        <div className="scroll-line"></div>
      </div>
    </section>
  );
}

function StatItem({ value, label }) {
  return (
    <div className="stat">
      <span className="stat-num">{value}+</span>
      <span>{label}</span>
    </div>
  );
}
