import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Minimal render-time safety net.
 *
 * Without a boundary, an exception thrown while rendering a modal child makes
 * React unmount the whole tree, which is what leaves the learner staring at an
 * empty white dialog. This boundary keeps the dialog usable and shows a real
 * message instead.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the failure visible in the console for debugging, without a blank UI.
    console.error('WealthGenie panel crashed while rendering:', error, info?.componentStack);
  }

  handleRetry() {
    this.setState({ error: null });
    if (this.props.onRetry) this.props.onRetry();
  }

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    const title = this.props.title || 'Something went wrong';
    const message =
      this.props.message ||
      'This panel could not be rendered. Please try again.';

    return (
      <div className="space-y-4" aria-live="assertive">
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
            <div>
              <h4 className="text-sm font-bold text-rose-950">{title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-rose-900">{message}</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={this.handleRetry}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {this.props.retryLabel || 'Try again'}
        </button>
      </div>
    );
  }
}
