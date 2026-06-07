import React from 'react';

const CLASSES = [
  { tag:'POPULAR', title:'Strength Training', desc:'Build muscle, increase power, and transform your physique.', featured:false, btn:'btn-outline' },
  { tag:'HOT', title:'HIIT Cardio', desc:'Maximum calorie burn in minimum time with high-intensity intervals.', featured:true, btn:'btn-red' },
  { tag:'RELAXING', title:'Yoga & Mindfulness', desc:'Balance strength with flexibility. Reduce stress and find peace.', featured:false, btn:'btn-outline' },
  { tag:'NEW', title:'Zumba Dance', desc:'Dance your way to fitness with our certified instructors.', featured:false, btn:'btn-outline' },
];

export default function ClassesSection({ onBook }) {
  return (
    <section className="classes" id="classes">
      <div className="container">
        <div className="section-header">
          <div className="section-label">WHAT WE OFFER</div>
          <h2 className="section-title">World-Class <span className="gold">Training</span> Programs</h2>
          <p>From beginners to elite athletes, we have a class for every goal.</p>
        </div>

        <div className="classes-grid">
          {CLASSES.map(({ tag, title, desc, featured, btn }) => (
            <div key={title} className={`class-card${featured ? ' featured' : ''}`}>
              <div className="class-info">
                <div className={`class-tag${featured ? ' gold-tag' : ''}`}>{tag}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <button className={btn} style={{ fontSize:'0.8rem', padding:'0.5rem 1rem' }}
                  onClick={() => onBook(title)}>
                  Book Class
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ticker */}
      <div className="ticker-wrap classes-ticker">
        <div className="ticker">
          {['STRENGTH TRAINING', 'HIIT CLASSES', 'YOGA AND MEDITATION', 'NUTRITION COACHING', 'STRENGTH TRAINING'].map((t, i) => (
            <React.Fragment key={i}><span>{t}</span><span className="sep">+</span></React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
