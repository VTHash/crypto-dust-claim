import React, { useState } from 'react';
import TipJar from './TipJar';
import './TipPill.css';

const TipPill = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating Pill */}
      <button
        type="button"
        className="tip-pill"
        onClick={() => setOpen(true)}
      >
        💚 TIP
      </button>

      {/* Modal */}
      {open && (
        <div
          className="tip-modal-overlay"
          onClick={() => setOpen(false)} // click outside closes
        >
          <div
            className="tip-modal"
            onClick={(e) => e.stopPropagation()} // prevent click-through
          >

            {/* Close button */}
            <button
              className="tip-modal-close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>

            {/* Tip Jar content */}
            <TipJar onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
};

export default TipPill;