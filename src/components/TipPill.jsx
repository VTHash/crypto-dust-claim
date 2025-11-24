import React, { useState } from "react";
import TipJar from "./TipJar";
import "./TipPill.css";

const TipPill = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating pill */}
      <button
        type="button"
        className="tip-pill"
        onClick={() => setOpen(true)}
      >
        💚 TIP
      </button>

      {/* Modal */}
      {open && (
        <div className="tip-modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="tip-modal"
            onClick={(e) => e.stopPropagation()} // prevent click-through
          >
            <button
              className="tip-modal-close"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>

            <TipJar />
          </div>
        </div>
      )}
    </>
  );
};

export default TipPill;