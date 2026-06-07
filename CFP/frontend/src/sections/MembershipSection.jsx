import React from 'react';
import { useNavigate } from 'react-router-dom';

const PLANS = [
  {
    id: 'starter',
    icon: '🌱',
    name: 'Starter',
    sub: 'Perfect for beginners',
    price: '1,500',
    amount: 1500,
    featured: false,
    features: [
      { ok: true, text: 'Full Gym Access' },
      { ok: true, text: '2 Group Classes/Week' },
      { ok: true, text: 'Locker Room Access' },
      { ok: true, text: 'Fitness Assessment' },
      { ok: false, text: 'Personal Trainer Sessions' },
      { ok: false, text: 'Nutrition Plan' },
    ],
    btn: 'btn-outline',
    label: 'Get Started',
  },
  {
    id: 'pro',
    icon: '⚡',
    name: 'Pro',
    sub: 'For serious athletes',
    price: '2,000',
    amount: 2000,
    featured: true,
    badge: 'MOST POPULAR',
    features: [
      { ok: true, text: 'Full Gym Access' },
      { ok: true, text: 'Unlimited Group Classes' },
      { ok: true, text: 'Locker + Towel Service' },
      { ok: true, text: 'Monthly Assessment' },
      { ok: true, text: '2 PT Sessions/Month' },
      { ok: true, text: 'Basic Nutrition Plan' },
    ],
    btn: 'btn-red',
    label: 'Get Pro',
  },
];

export default function MembershipSection({ onPay }) {
  const navigate = useNavigate();

  return (
    <section className="membership" id="membership">
      <div className="container">
        <div className="section-header">
          <div className="section-label">PRICING PLANS</div>
          <h2 className="section-title">Choose Your <span className="gold">Membership</span></h2>
          <p>Two simple plans, no hidden fees.</p>
        </div>

        <div className="plans-grid">
          {PLANS.map(({ id, icon, name, sub, price, amount, featured, badge, features, btn, label }) => (
            <div key={id} className={`plan-card${featured ? ' featured-plan' : ''}`}>
              {badge && <div className="plan-badge">{badge}</div>}
              <div className="plan-header">
                <div className="plan-icon">{icon}</div>
                <h3>{name}</h3>
                <p>{sub}</p>
              </div>
              <div className="plan-price">
                <span className="currency">Rs.</span>
                <span className="amount">{price}</span>
                <span className="period">/month</span>
              </div>
              <ul className="plan-features">
                {features.map(({ ok, text }) => (
                  <li key={text} className={ok ? '' : 'disabled'}>{ok ? '✓' : '✕'} {text}</li>
                ))}
              </ul>
              <button className={`${btn} btn-full`} onClick={() => onPay(name, amount)}>
                {label}
              </button>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ color: 'var(--gray-light)', marginBottom: '0.8rem', fontSize: '0.9rem' }}>
            Pay via QR code (eSewa / Bank)?
          </p>
          <button className="btn-outline" onClick={() => navigate('/payment')}>
            Go to QR Payment Page →
          </button>
        </div>
      </div>
    </section>
  );
}
