import React, { useState } from 'react';

const PHOTOS = Array.from({ length: 12 }, (_, index) => ({
  src: `gym-photos/gym-${String(index + 1).padStart(2, '0')}.jpeg`,
  alt: `Classic Fitness Park photo ${index + 1}`,
}));

export default function GallerySection() {
  const [active, setActive] = useState(null);

  return (
    <section className="gallery" id="gallery">
      <div className="container">
        <div className="section-header">
          <div className="section-label">OUR FACILITY</div>
          <h2 className="section-title">Inside the <span className="gold">Park</span></h2>
          <p>Real photos from our actual gym in Kakarvitta, Jhapa</p>
        </div>

        <div className="gallery-grid">
          {PHOTOS.map(({ src, alt }, index) => (
            <button key={index} type="button" className="gallery-item" onClick={() => setActive(src)}>
              <img src={src} alt={alt} loading="lazy" />
              <div className="gallery-overlay"><span>View</span></div>
            </button>
          ))}
        </div>
      </div>

      {active ? (
        <div
          className="lightbox"
          onClick={() => setActive(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={active} alt="Gallery" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '12px', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }} />
          <button
            type="button"
            onClick={() => setActive(null)}
            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'var(--red)', border: 'none', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            x
          </button>
        </div>
      ) : null}
    </section>
  );
}
