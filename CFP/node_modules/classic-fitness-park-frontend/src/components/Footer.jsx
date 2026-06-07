import React from 'react';
import { Link } from 'react-router-dom';
import { PUBLIC_NAV_LINKS } from '../constants/publicNavigation';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="container footer-grid">
          <div className="footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1rem' }}>
              <img src="/logo.jpg" alt="CFP" className="nav-logo-img" />
              <span className="logo-main">CLASSIC FITNESS PARK</span>
            </div>
            <p>Nepal's premier fitness destination in the heart of Kakarvitta, Jhapa. Transforming lives since 2074.</p>
            <div className="payment-badges" style={{ marginTop: '1rem' }}>
              <span className="pay-badge esewa">eSewa</span>
              <span className="pay-badge prabhu">Bank</span>
              <span className="pay-badge cash">Cash</span>
            </div>
          </div>

          <div className="footer-links">
            <h4>Website</h4>
            {PUBLIC_NAV_LINKS.map(({ to, label }) => (
              <Link key={to} to={to}>{label}</Link>
            ))}
          </div>

          <div className="footer-links">
            <h4>Portals</h4>
            <Link to="/member">Member Portal</Link>
            <Link to="/trainer">Trainer Portal</Link>
            <Link to="/admin">Admin Panel</Link>
            <Link to="/payment">QR Payment</Link>
          </div>

          <div className="footer-links">
            <h4>Hours</h4>
            <Link to="/contact">Sun–Fri: 5AM–9PM</Link>
            <Link to="/contact">Break: 11AM–2PM</Link>
            <Link to="/contact">Saturday: Closed</Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <p>© 2025 Classic Fitness Park, Kakarvitta, Jhapa, Nepal. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
