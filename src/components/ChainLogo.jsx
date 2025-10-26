import React from 'react'

const ChainLogo = ({ src, alt, className = '' }) => (
  <img
    src={src}
    alt={alt || 'chain'}
    className={`chain-logo ${className}`}
    onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
  />
)

export default ChainLogo