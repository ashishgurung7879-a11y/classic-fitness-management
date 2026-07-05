import React, { useEffect, useState } from 'react';
import { publicApi } from '../utils/api';

function displayTag(type) {
  return String(type || 'class').replace(/[^a-z0-9 ]/gi, '').toUpperCase() || 'CLASS';
}

export default function ClassesSection({ onBook }) {
  const [classes, setClasses] = useState([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadClasses() {
      const { ok, data } = await publicApi('/classes');
      if (cancelled) return;

      if (!ok) {
        setClasses([]);
        setApiLoaded(true);
        setApiError(true);
        return;
      }

      setClasses(Array.isArray(data.classes) ? data.classes : []);
      setApiLoaded(true);
      setApiError(false);
    }

    loadClasses();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="classes" id="classes">
      <div className="container">
        <div className="section-header">
          <div className="section-label">WHAT WE OFFER</div>
          <h2 className="section-title">World-Class <span className="gold">Training</span> Programs</h2>
          <p>From beginners to elite athletes, we have a class for every goal.</p>
        </div>

        {apiError ? <p className="shop-note">Classes could not be loaded because the backend could not be reached.</p> : null}

        <div className="classes-grid">
          {apiLoaded && classes.length === 0 ? (
            <div className="shop-empty" style={{ gridColumn: '1 / -1' }}>
              {apiError ? 'Classes are unavailable because the backend could not be reached.' : 'No classes available.'}
            </div>
          ) : classes.map((item) => {
            const title = item.name || item.title || 'Training Program';
            const description = item.description || item.desc || '';
            const tag = displayTag(item.type || item.tag);
            const featured = tag === 'HOT';

            return (
              <div key={item._id || title} className={`class-card${featured ? ' featured' : ''}`}>
                <div className="class-info">
                  <div className={`class-tag${featured ? ' gold-tag' : ''}`}>{tag}</div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <button className={featured ? 'btn-red' : 'btn-outline'} style={{ fontSize:'0.8rem', padding:'0.5rem 1rem' }}
                    onClick={() => onBook(title)}>
                    Book Class
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {classes.length > 0 ? (
        <div className="ticker-wrap classes-ticker">
          <div className="ticker">
            {classes.map((item, index) => {
              const text = String(item.name || item.title || '').trim();
              if (!text) return null;
              return (
                <React.Fragment key={item._id || item.id || `${text}-${index}`}><span>{text.toUpperCase()}</span><span className="sep">+</span></React.Fragment>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
