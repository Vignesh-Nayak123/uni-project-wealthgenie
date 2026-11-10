import React from 'react';

/**
 * Reusable Badge component for category tags, difficulty pills, and statuses
 */
export default function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}) {
  const variantStyles = {
    default: 'bg-navy-100 text-navy-800 border-navy-200/60',
    green: 'bg-genie-50 text-genie-800 border-genie-200/80',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    blue: 'bg-blue-50 text-blue-800 border-blue-200/80',
    indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
    amber: 'bg-amber-50 text-amber-900 border-amber-200/80',
    rose: 'bg-rose-50 text-rose-800 border-rose-200/80',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const sizeStyles = {
    xs: 'text-[11px] px-2 py-0.5 leading-none font-medium',
    sm: 'text-xs px-2.5 py-1 font-medium',
    md: 'text-sm px-3 py-1.5 font-medium',
  };

  const selectedVariant = variantStyles[variant] || variantStyles.default;
  const selectedSize = sizeStyles[size] || sizeStyles.sm;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border tracking-normal ${selectedVariant} ${selectedSize} ${className}`}
    >
      {children}
    </span>
  );
}
