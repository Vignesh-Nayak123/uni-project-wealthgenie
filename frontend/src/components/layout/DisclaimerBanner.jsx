import React, { useState } from 'react';
import { Info, X } from 'lucide-react';

const DISMISS_KEY = 'wealthgenie.disclaimerDismissed.v1';

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export default function DisclaimerBanner() {
  const [isDismissed, setIsDismissed] = useState(wasDismissed);

  if (isDismissed) return null;

  const dismiss = () => {
    setIsDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode: the banner simply reappears next visit.
    }
  };

  return (
    <aside
      aria-label="About WealthGenie"
      className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs text-amber-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong className="font-semibold text-amber-950">WealthGenie is for learning.</strong>{' '}
            We explain how money works and help you plan with your own numbers. We are not a
            SEBI-registered adviser, and nothing here is a recommendation to buy or sell any
            investment.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded p-1 text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-950"
          aria-label="Dismiss this notice"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}
