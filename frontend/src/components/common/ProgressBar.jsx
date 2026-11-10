import React from 'react';

/**
 * Accessible ProgressBar with aria attributes, label options, and smooth transitions
 */
export default function ProgressBar({
  value = 0,
  max = 100,
  label,
  showPercentage = false,
  color = 'genie',
  size = 'md',
  className = '',
}) {
  const percentage = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  };

  const colorClasses = {
    genie: 'bg-genie-600',
    emerald: 'bg-emerald-600',
    blue: 'bg-blue-600',
    indigo: 'bg-indigo-600',
    amber: 'bg-amber-500',
  };

  const barColor = colorClasses[color] || colorClasses.genie;

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-xs font-medium text-navy-700 mb-1.5">
          <span>{label}</span>
          {showPercentage && <span className="text-navy-900 font-semibold">{percentage}%</span>}
        </div>
      )}
      <div
        className={`w-full bg-slate-100 rounded-full overflow-hidden ${sizeClasses[size]}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || 'Progress bar'}
      >
        <div
          className={`${sizeClasses[size]} rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
