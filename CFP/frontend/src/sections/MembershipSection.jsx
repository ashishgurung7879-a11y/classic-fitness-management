import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicApi } from '../utils/api';

function normalizeFeatures(features) {
  return Array.isArray(features)
    ? features.map((feature) => (
      typeof feature === 'string'
        ? { ok: true, text: feature }
        : { ok: feature?.ok !== false, text: feature?.text || feature?.label || '' }
    )).filter((feature) => feature.text)
    : [];
}

export default function MembershipSection({ onPay }) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      const { ok, data } = await publicApi('/membership-plans');
      if (cancelled) return;

      if (!ok) {
        setPlans([]);
        setApiLoaded(true);
        setApiError(true);
        return;
      }

      setPlans(Array.isArray(data.plans) ? data.plans.filter((plan) => plan?.isActive !== false) : []);
      setApiLoaded(true);
      setApiError(false);
    }

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="membership" id="membership">
      <div className="container">
        <div className="section-header">
          <div className="section-label">PRICING PLANS</div>
          <h2 className="section-title">Choose Your <span className="gold">Membership</span></h2>
          <p>Membership options are managed from the database.</p>
        </div>

        {apiError ? <p className="shop-note">Membership plans could not be loaded because the backend could not be reached.</p> : null}

        <div className="plans-grid">
          {apiLoaded && plans.length === 0 ? (
            <div className="shop-empty" style={{ gridColumn: '1 / -1' }}>
              {apiError ? 'Membership plans are unavailable right now.' : 'No membership plans available.'}
            </div>
          ) : plans.map((plan) => {
            const id = plan._id || plan.id || plan.name;
            const name = plan.name || 'Membership Plan';
            const amount = Number(plan.amount ?? plan.price ?? 0);
            const price = plan.price || Number(amount || 0).toLocaleString();
            const featured = !!plan.featured;
            const features = normalizeFeatures(plan.features);

            return (
              <div key={id} className={`plan-card${featured ? ' featured-plan' : ''}`}>
                {plan.badge ? <div className="plan-badge">{plan.badge}</div> : null}
                <div className="plan-header">
                  <div className="plan-icon">{plan.icon || ''}</div>
                  <h3>{name}</h3>
                  <p>{plan.sub || plan.description || ''}</p>
                </div>
                <div className="plan-price">
                  <span className="currency">Rs.</span>
                  <span className="amount">{price}</span>
                  <span className="period">{plan.period || '/month'}</span>
                </div>
                {features.length > 0 ? (
                  <ul className="plan-features">
                    {features.map(({ ok, text }) => (
                      <li key={text} className={ok ? '' : 'disabled'}>{ok ? 'YES' : 'NO'} {text}</li>
                    ))}
                  </ul>
                ) : null}
                <button className={`${featured ? 'btn-red' : 'btn-outline'} btn-full`} onClick={() => onPay(name, amount)}>
                  {plan.label || plan.buttonLabel || 'Select Plan'}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ color: 'var(--gray-light)', marginBottom: '0.8rem', fontSize: '0.9rem' }}>
            Pay via QR code (eSewa / Bank)?
          </p>
          <button className="btn-outline" onClick={() => navigate('/payment')}>
            Go to QR Payment Page
          </button>
        </div>
      </div>
    </section>
  );
}
