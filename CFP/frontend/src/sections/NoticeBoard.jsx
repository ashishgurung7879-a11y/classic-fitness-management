import React, { useEffect, useState } from 'react';
import { publicApi } from '../utils/api';

const noticeCardStyle = {
  background: 'var(--dark2)',
  borderRadius: '10px',
  padding: '1.2rem 1.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  marginBottom: '0.8rem',
};

export default function NoticeBoard() {
  const [notices, setNotices] = useState([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadNotices() {
      const { ok, data } = await publicApi('/notices');
      if (cancelled) return;

      if (!ok) {
        setNotices([]);
        setApiLoaded(true);
        setApiError(true);
        return;
      }

      setNotices(Array.isArray(data.notices) ? data.notices : []);
      setApiLoaded(true);
      setApiError(false);
    }

    loadNotices();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="notices" style={{ background:'var(--dark)', padding:'4rem 0', borderTop:'1px solid rgba(204,0,0,0.1)' }}>
      <div className="container">
        <div className="section-header">
          <div className="section-label">LATEST UPDATES</div>
          <h2 className="section-title">Notice <span className="gold">Board</span></h2>
        </div>

        <div id="noticeBoard" style={{ maxWidth:'800px', margin:'0 auto' }}>
          {!apiLoaded ? (
            <div style={{ ...noticeCardStyle, borderLeft:'4px solid var(--green)' }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.2rem', color:'var(--green)' }}>...</div>
              <div>
                <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.1rem', color:'var(--green)' }}>Loading notices</div>
                <div style={{ fontSize:'0.85rem', color:'var(--gray-light)' }}>Checking the latest gym updates.</div>
              </div>
            </div>
          ) : notices.length === 0 ? (
            <div style={{ ...noticeCardStyle, borderLeft:'4px solid var(--gold)' }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.2rem', color:'var(--gold)' }}>INFO</div>
              <div>
                <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.1rem', color:'var(--gold)' }}>{apiError ? 'Notices unavailable' : 'No notices right now'}</div>
                <div style={{ fontSize:'0.85rem', color:'var(--gray-light)' }}>{apiError ? 'The backend could not be reached.' : 'Please check back later for gym updates.'}</div>
              </div>
            </div>
          ) : notices.map((n, i) => (
            <div key={n._id || n.id || i} style={{ ...noticeCardStyle, borderLeft:`4px solid ${n.color||'var(--gold)'}` }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.2rem', color:n.color||'var(--gold)' }}>{n.emoji || n.icon || 'INFO'}</div>
              <div>
                <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.1rem', color:n.color||'var(--gold)' }}>{n.title}</div>
                <div style={{ fontSize:'0.85rem', color:'var(--gray-light)' }}>{n.message || n.content}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
