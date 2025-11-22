import React from "react";
import "./Shimmer.css";

const Shimmer = ({ width = "40px", height = "40px", radius = "50%" }) => {
  return (
    <div
      className="shimmer"
      style={{ width, height, borderRadius: radius }}
    ></div>
  );
};

export default Shimmer;