import React from 'react';

/**
 * Reusable Card component adhering to clean, trustworthy fintech styling:
 * crisp white background, subtle border, restrained shadows.
 */
export default function Card({
  children,
  className = '',
  hoverEffect = false,
  padding = 'default',
  onClick,
  as: Component = 'div',
  ...rest
}) {
  const paddingStyles = {
    none: '',
    sm: 'p-4',
    default: 'p-5 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  const hoverStyle = hoverEffect
    ? 'transition-all duration-200 hover:shadow-card hover:border-slate-300 hover:-translate-y-0.5 cursor-pointer'
    : '';

  return (
    <Component
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200/90 shadow-subtle ${paddingStyles[padding]} ${hoverStyle} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}
