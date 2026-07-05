import React, { useEffect, useState } from 'react';
import { publicApi } from '../utils/api';

export default function GallerySection() {
  const [active, setActive] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      const { ok, data } = await publicApi('/gallery');
      if (cancelled) return;

      if (!ok) {
        setPhotos([]);
        setApiLoaded(true);
        setApiError(true);
        return;
      }

      setPhotos(Array.isArray(data.photos) ? data.photos : []);
      setApiLoaded(true);
      setApiError(false);
    }

    loadPhotos();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="gallery" id="gallery">
      <div className="container">
        <div className="section-header">
          <div className="section-label">OUR FACILITY</div>
          <h2 className="section-title">Inside the <span className="gold">Park</span></h2>
          <p>Real photos from our actual gym in Kakarvitta, Jhapa</p>
        </div>

        {apiError ? <p className="shop-note">Gallery could not be loaded because the backend could not be reached.</p> : null}

        <div className="gallery-grid">
          {apiLoaded && photos.length === 0 ? (
            <div className="shop-empty" style={{ gridColumn: '1 / -1' }}>
              {apiError ? 'Gallery is unavailable right now.' : 'No gallery photos available.'}
            </div>
          ) : photos.map(({ imageUrl, title }, index) => (
            <button key={imageUrl || index} type="button" className="gallery-item" onClick={() => setActive(imageUrl)}>
              <img src={imageUrl} alt={title || `Classic Fitness Park photo ${index + 1}`} loading="lazy" />
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
