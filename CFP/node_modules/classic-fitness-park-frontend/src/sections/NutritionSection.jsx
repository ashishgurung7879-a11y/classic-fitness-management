import React, { useState } from 'react';

const MUSCLE = {
  meals: [
    { time:'07:00 AM', title:'Breakfast',          desc:'4 whole eggs, 2 slices whole wheat bread, 1 banana',      kcal:'550 kcal' },
    { time:'11:00 AM', title:'Pre-Workout Snacks', desc:'Oatmeal with whey protein and peanut butter',             kcal:'450 kcal' },
    { time:'02:00 PM', title:'Lunch',              desc:'200g chicken breast, 1 cup brown rice, mixed veggies',    kcal:'600 kcal' },
  ],
  total: 'TOTAL: 2850 KCAL | 180g PROTEIN',
  workouts: [
    { day:'SUN', type:'strength', name:'Chest & Triceps',   desc:'Bench press, incline DB, cable crossovers' },
    { day:'MON', type:'strength', name:'Back & Biceps',     desc:'Deadlifts, pull-ups, barbell rows' },
    { day:'TUE', type:'strength', name:'Legs & Core',       desc:'Squats, leg press, lunges' },
    { day:'WED', type:'rest',     name:'Active Recovery',   desc:'Light cardio, yoga' },
  ],
};

const FATLOSS = {
  meals: [
    { time:'07:30 AM', title:'Breakfast', desc:'3 egg whites, 1 whole egg, spinach, green tea',       kcal:'250 kcal' },
    { time:'01:00 PM', title:'Lunch',     desc:'150g grilled fish, large green salad',                kcal:'400 kcal' },
    { time:'07:00 PM', title:'Dinner',    desc:'150g chicken breast, steamed broccoli',               kcal:'350 kcal' },
  ],
  total: 'TOTAL: 1500 KCAL | 130g PROTEIN',
  workouts: [
    { day:'SUN', type:'hiit',     name:'HIIT Cardio',       desc:'20 mins intervals, battle ropes' },
    { day:'MON', type:'strength', name:'Full Body Circuit', desc:'Compound movements' },
    { day:'TUE', type:'hiit',     name:'Steady Cardio',     desc:'45 mins treadmill' },
  ],
};

export default function NutritionSection() {
  const [tab, setTab] = useState('muscle');
  const data = tab === 'muscle' ? MUSCLE : FATLOSS;

  return (
    <section className="diet-section" id="nutrition">
      <div className="container">
        <div className="section-header">
          <div className="section-label">NUTRITION PLANS</div>
          <h2 className="section-title">Fuel Your <span className="gold">Workouts</span></h2>
          <p>Combining the right training routine with an optimized meal plan</p>
        </div>

        <div className="diet-tabs">
          <button className={`diet-tab${tab==='muscle'  ? ' active':''}`} onClick={() => setTab('muscle')}>Muscle Gain</button>
          <button className={`diet-tab${tab==='fatloss' ? ' active':''}`} onClick={() => setTab('fatloss')}>Fat Loss</button>
        </div>

        <div className="diet-grid">
          {/* Meal plan */}
          <div className="meal-plan">
            <h3>Daily Meal Plan</h3>
            {data.meals.map(({ time, title, desc, kcal }) => (
              <div key={time} className="meal-item">
                <div className="meal-time">{time}</div>
                <div className="meal-detail">
                  <strong>{title}</strong>
                  <p>{desc}</p>
                  <span className="cal-badge">{kcal}</span>
                </div>
              </div>
            ))}
            <div className="daily-total">{data.total}</div>
          </div>

          {/* Workout split */}
          <div className="workout-plan">
            <h3>Training Split</h3>
            {data.workouts.map(({ day, type, name, desc }) => (
              <div key={day} className="workout-day">
                <div className={`day-badge ${type}`}>{day}</div>
                <div>
                  <strong>{name}</strong>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
