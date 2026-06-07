import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '../utils/api';
import { useToast } from '../context/ToastContext';

const MAP_URL = 'https://maps.app.goo.gl/mkYpeV18VR5cWXEQ9';
const MAP_EMBED_URL = 'https://www.google.com/maps?q=Classic%20Fitness%20Park%2C%20Kakarvitta%2C%20Mechinagar%2006%2C%20Jhapa%2C%20Nepal&output=embed';

export default function ContactSection() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name:'', phone:'', email:'', type:'Membership', message:'' });
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const type = searchParams.get('type');
    if (type) {
      setForm((current) => ({ ...current, type }));
    }
  }, [searchParams]);

  const update = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    const { ok, data } = await publicApi('/contact', { method: 'POST', body: form });
    setBusy(false);
    if (ok) {
      showToast('Message sent! We will contact you soon.');
      setForm({ name:'', phone:'', email:'', type:'Membership', message:'' });
    } else {
      showToast('Error: ' + (data.message || 'Failed to send'));
    }
  };

  return (
    <section className="contact" id="contact">
      <div className="container">
        <div className="section-header">
          <div className="section-label">GET IN TOUCH</div>
          <h2 className="section-title">Visit <span className="gold">Classic Fitness Park</span></h2>
        </div>

        <div className="contact-grid">
          {/* Info */}
          <div className="contact-info">
            <div className="info-card">
              <h3>Location</h3>
              <p>Kakarvitta, Mechinagar 06<br />Jhapa, Province No. 1, Nepal</p>
            </div>
            <div className="info-card">
              <h3>Opening Hours</h3>
              <p>Sunday - Friday: 5:00 AM - 9:00 PM<br />Break: 11:00 AM - 2:00 PM<br />Saturday: Closed</p>
            </div>
            <div className="info-card">
              <h3>Contact</h3>
              <p>Phone: +977 986-3707701<br />Email: classicfitnesspark@gmail.com</p>
            </div>
            <div className="info-card">
              <h3>Portals</h3>
              <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                <Link to="/member" className="btn-outline" style={{ padding:'0.4rem 0.8rem', fontSize:'0.78rem' }}>Member Login</Link>
                <Link to="/trainer" className="btn-outline" style={{ padding:'0.4rem 0.8rem', fontSize:'0.78rem' }}>Trainer Login</Link>
                <Link to="/admin" className="btn-outline" style={{ padding:'0.4rem 0.8rem', fontSize:'0.78rem' }}>Admin Panel</Link>
              </div>
            </div>
            <div className="map-wrap">
              <a href={MAP_URL} target="_blank" rel="noreferrer" className="map-link">
                Open in Google Maps
              </a>
              <iframe
                title="Classic Fitness Park Location"
                src={MAP_EMBED_URL}
                style={{ width:'100%', height:'200px', border:'none', borderRadius:'12px' }}
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>

          {/* Form */}
          <form className="contact-form" onSubmit={submit}>
            <h3>Send Us a Message</h3>
            <div className="form-row">
              <div>
                <label>Full Name *</label>
                <input name="name" value={form.name} onChange={update} required placeholder="Your full name" />
              </div>
              <div>
                <label>Phone *</label>
                <input name="phone" value={form.phone} onChange={update} required placeholder="98XXXXXXXX" pattern="\d{10}" />
              </div>
            </div>
            <div>
              <label>Email</label>
              <input name="email" value={form.email} onChange={update} type="email" placeholder="email@example.com" />
            </div>
            <div>
              <label>Inquiry Type</label>
              <select name="type" value={form.type} onChange={update}>
                {['Membership', 'Personal Training', 'Group Classes', 'Nutrition', 'Shop Order', 'Trainer Application', 'Other'].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Message *</label>
              <textarea name="message" value={form.message} onChange={update} required rows={4} placeholder="How can we help you?" />
            </div>
            <button type="submit" className="btn-red btn-full" disabled={busy}>
              {busy ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
