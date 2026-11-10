import React, { useState } from 'react';
import { Sparkles, ArrowRight, Bot, HelpCircle } from 'lucide-react';
import Card from '../common/Card';
import { SAMPLE_AI_PROMPTS } from '../../data/mockData';

export default function AskGenieBanner({ onNavigateWithPrompt }) {
  const [quickInput, setQuickInput] = useState('');

  const samplePrompts = SAMPLE_AI_PROMPTS || [
    'What is an Index Fund vs Active Mutual Fund?',
    'How much should I keep in an emergency fund?',
    'What is the difference between PPF and EPF?',
    'When is entering a UPI PIN strictly required?',
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (quickInput.trim()) {
      onNavigateWithPrompt(quickInput.trim());
    } else {
      onNavigateWithPrompt(samplePrompts[0]);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 to-navy-950 text-white p-6 sm:p-7 shadow-elevated border border-navy-800">
      {/* Decorative ambient background */}
      <div className="absolute top-0 right-0 -mt-6 -mr-6 w-56 h-56 rounded-full bg-genie-500/10 blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-8 w-48 h-48 rounded-full bg-indigo-500/10 blur-xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-genie-600/20 border border-genie-500/30 text-genie-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Ask WealthGenie AI Tutor
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-genie-500/20 text-genie-300 border border-genie-400/30">
                  Backend Connected
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Plain-English financial explanations for Indian beginners. Zero stock tips, zero jargon.
              </p>
            </div>
          </div>
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="mb-4">
          <div className="flex items-center bg-white/10 backdrop-blur-md rounded-xl p-1.5 border border-white/15 focus-within:border-genie-400 focus-within:ring-2 focus-within:ring-genie-400/20 transition-all">
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="Ask anything (e.g., 'What is a Nifty 50 Index Fund?', 'How does PPF tax exemption work?')..."
              className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none"
              aria-label="Ask WealthGenie a financial question"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-genie-600 hover:bg-genie-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
            >
              <span>Ask Genie</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Quick prompt chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Popular topics:</span>
          </span>
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onNavigateWithPrompt(prompt)}
              className="text-xs text-slate-200 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-full px-3 py-1 transition-all text-left truncate max-w-xs"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
