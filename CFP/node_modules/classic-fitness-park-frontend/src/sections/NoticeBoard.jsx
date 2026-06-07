import React, { useEffect, useState } from 'react';
import { publicApi } from '../utils/api';

export default function NoticeBoard() {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    publicApi('/notices').then(({ ok, data }) => {
      if (ok && data.notices?.length) setNotices(data.notices);
    });
  }, []);

  return (
    <section id="notices" style={{ background:'var(--dark)', padding:'4rem 0', borderTop:'1px solid rgba(204,0,0,0.1)' }}>
      <div className="container">
        <div className="section-header">
          <div className="section-label">LATEST UPDATES</div>
          <h2 className="section-title">📢 Notice <span className="gold">Board</span></h2>
        </div>

        <div id="noticeBoard" style={{ maxWidth:'800px', margin:'0 auto' }}>
          {notices.length === 0 ? (
            <div style={{ background:'var(--dark2)', borderLeft:'4px solid var(--green)', borderRadius:'10px', padding:'1.2rem 1.5rem', display:'flex', alignItems:'center', gap:'1rem', marginBottom:'0.8rem' }}>
              <div style={{ fontSize:'2rem' }}>✅</div>
              <div>
                <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.1rem', color:'var(--green)' }}>GYM IS OPEN TODAY</div>
                <div style={{ fontSize:'0.85rem', color:'var(--gray-light)' }}>5:00 AM – 9:00 PM · All facilities available</div>
              </div>
            </div>
          ) : notices.map((n, i) => (
            <div key={i} style={{ background:'var(--dark2)', borderLeft:`4px solid ${n.color||'var(--gold)'}`, borderRadius:'10px', padding:'1.2rem 1.5rem', display:'flex', alignItems:'center', gap:'1rem', marginBottom:'0.8rem' }}>
              <div style={{ fontSize:'2rem' }}>{n.emoji || '📢'}</div>
              <div>
                <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.1rem', color:n.color||'var(--gold)' }}>{n.title}</div>
                <div style={{ fontSize:'0.85rem', color:'var(--gray-light)' }}>{n.message}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
