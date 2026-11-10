import React, { useState } from 'react';
import { Info, X, ShieldAlert } from 'lucide-react';

export default function DisclaimerBanner() {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <aside aria-label="Educational Disclaimer" className="bg-amber-50/90 border-b border-amber-200/80 px-4 py-2.5 text-xs text-amber-900 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          <p>
            <strong className="font-semibold text-amber-950">Educational Financial Literacy Platform:</strong>{' '}
            WealthGenie provides educational concepts and calculators for Indian beginners. We are not a SEBI-registered Investment Adviser. All scenario metrics and portfolio illustrations are for literacy purposes and do not constitute certified financial or investment advice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="text-amber-700 hover:text-amber-950 p-1 rounded hover:bg-amber-100 transition-colors shrink-0"
          aria-label="Dismiss disclaimer banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
