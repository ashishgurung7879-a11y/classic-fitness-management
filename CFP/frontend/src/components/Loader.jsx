import React from 'react';

export default function Loader({ hidden }) {
  return (
    <div className={`loader${hidden ? ' hidden' : ''}`} id="loader">
      <div className="loader-inner" style={{ textAlign: 'center' }}>
        <div className="loader-logo">CLASSIC FITNESS PARK</div>
        <div className="loader-bar">
          <div className="loader-progress"></div>
        </div>
      </div>
    </div>
  );
}
