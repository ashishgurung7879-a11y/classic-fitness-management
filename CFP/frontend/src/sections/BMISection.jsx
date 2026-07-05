import React, { useState } from 'react';

export default function BMISection() {
  const [gender, setGender] = useState('male');
  const [unit,   setUnit]   = useState('metric');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age,    setAge]    = useState('');
  const [result, setResult] = useState(null);

  const calculate = () => {
    const h = parseFloat(height), w = parseFloat(weight), a = parseInt(age);
    if (!h || !w || !a) return;
    let bmi = unit === 'metric' ? w / ((h / 100) ** 2) : (703 * w) / (h ** 2);
    bmi = parseFloat(bmi.toFixed(1));
    let status, color, pos;
    if (bmi < 18.5)    { status = ' Underweight';  color = '#3498db'; pos = 5; }
    else if (bmi < 25) { status = ' Normal Weight'; color = '#2ecc71'; pos = 30; }
    else if (bmi < 30) { status = ' Overweight';   color = '#f39c12'; pos = 60; }
    else               { status = ' Obese';         color = '#e74c3c'; pos = 88; }
    setResult({ bmi, status, color, pos });
  };

  return (
    <section className="bmi-section" id="bmi">
      <div className="bmi-bg"></div>
      <div className="container bmi-container">
        <div className="bmi-grid">

          {/* Info + Result */}
          <div className="bmi-info">
            <div className="section-label">ANALYSIS</div>
            <h2 className="section-title">Calculate Your <span className="gold">BMI</span></h2>
            <p>Knowing your Body Mass Index (BMI) gives you a starting point. It helps us figure out the exact nutrition and workout plans tailored precisely for your transformation journey.</p>

            <div className="bmi-result-display">
              <div className="bmi-number" style={{ color: result ? result.color : 'var(--gold)' }}>
                {result ? result.bmi : '--'}
              </div>
              <div className="bmi-status">{result ? result.status : 'Enter your details'}</div>
              <div className="bmi-bar">
                <div className="bmi-indicator" style={{ left: result ? `${result.pos}%` : '0%' }}></div>
                <div className="bmi-zones">
                  <div style={{ flex:18.5, borderRight:'1px solid #000', background:'rgba(52,152,219,0.3)' }}>Low</div>
                  <div style={{ flex:6.5,  borderRight:'1px solid #000', background:'rgba(46,204,113,0.3)' }}>Normal</div>
                  <div style={{ flex:5,    borderRight:'1px solid #000', background:'rgba(243,156,18,0.3)' }}>Over</div>
                  <div style={{ flex:10,   background:'rgba(231,76,60,0.3)' }}>Obese</div>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="bmi-form-wrap" style={{ background:'var(--dark2)', padding:'2rem', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.1)' }}>
            {/* Unit toggle */}
            <div style={{ display:'flex', marginBottom:'1.5rem', background:'var(--dark)', padding:'0.3rem', borderRadius:'8px' }}>
              {[['metric','Metric (cm/kg)'],['standard','Standard (in/lb)']].map(([val, lbl]) => (
                <button key={val} onClick={() => setUnit(val)}
                  style={{ flex:1, background: unit===val ? 'var(--gold)' : 'transparent', border:'none', color: unit===val ? '#fff' : 'var(--gray-light)', padding:'0.5rem', cursor:'pointer', borderRadius:'6px' }}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Gender */}
            <div style={{ display:'flex', gap:'1rem', marginBottom:'1rem' }}>
              {[['male',' Male'],['female',' Female']].map(([val, lbl]) => (
                <button key={val} onClick={() => setGender(val)}
                  className={`gender-btn${gender===val ? ' active' : ''}`}
                  style={{ flex:1, padding:'0.8rem', borderRadius:'8px', cursor:'pointer', border:'1px solid rgba(255,255,255,0.1)', background: gender===val ? 'rgba(204,0,0,0.1)' : 'rgba(255,255,255,0.05)', color:'var(--white)' }}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Inputs */}
            <div style={{ display:'flex', gap:'1rem', marginBottom:'1rem' }}>
              <input type="number" value={height} onChange={e => setHeight(e.target.value)}
                placeholder={unit==='metric' ? 'Height (cm)' : 'Height (in)'} required
                style={{ flex:1, background:'var(--dark)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--white)', padding:'0.8rem', borderRadius:'8px', width:'100%' }} />
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
                placeholder={unit==='metric' ? 'Weight (kg)' : 'Weight (lb)'} required
                style={{ flex:1, background:'var(--dark)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--white)', padding:'0.8rem', borderRadius:'8px', width:'100%' }} />
            </div>
            <input type="number" value={age} onChange={e => setAge(e.target.value)}
              placeholder="Age" required
              style={{ width:'100%', marginBottom:'1.5rem', background:'var(--dark)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--white)', padding:'0.8rem', borderRadius:'8px' }} />
            <button className="btn-red btn-full" onClick={calculate}>Calculate BMI</button>
          </div>

        </div>
      </div>
    </section>
  );
}
