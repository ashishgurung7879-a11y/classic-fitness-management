import React from 'react';

export default function PageHero({
  eyebrow,
  title,
  description,
  actions = [],
  theme = 'ember',
  highlights = [],
  aside = null,
}) {
  return (
    <section className={`page-hero theme-${theme}`}>
      <div className="container">
        <div className="page-hero-panel">
          <div className="page-hero-copy">
            {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
            <h1 className="page-title">{title}</h1>
            {description ? <p className="page-description">{description}</p> : null}
            {actions.length ? (
              <div className="page-actions">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={action.variant || 'btn-outline'}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
            {highlights.length ? (
              <div className="page-highlight-grid">
                {highlights.map((highlight) => (
                  <article key={highlight.label} className="page-highlight-card">
                    <span className="page-highlight-label">{highlight.label}</span>
                    <strong className="page-highlight-value">{highlight.value}</strong>
                    {highlight.note ? <p className="page-highlight-note">{highlight.note}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
          {aside ? <div className="page-hero-aside">{aside}</div> : null}
        </div>
      </div>
    </section>
  );
}
