import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  HelpCircle,
  Bot,
  User,
  ShieldAlert,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Settings,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import { SAMPLE_AI_PROMPTS } from '../data/mockData';

export default function AskGeniePage({ initialPrompt, onClearInitialPrompt }) {
  const [messages, setMessages] = useState([
    {
      id: 'msg-0',
      sender: 'genie',
      time: 'Just now',
      text: `Namaste Aarav! I am your **WealthGenie AI Financial Tutor**.\n\nI am designed to explain Indian personal finance concepts like Systematic Investment Plans (SIPs), emergency funds, liquid funds, PPF/EPF, and UPI digital safety in clear, jargon-free language.\n\n*Important Compliance Notice: I provide educational explanations for financial literacy and do not offer certified financial advice or stock tips.*`,
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState({ isConfigured: false, checked: false });
  const messagesEndRef = useRef(null);

  // Check AI service status on mount
  useEffect(() => {
    fetch('/api/ai/status')
      .then((res) => res.json())
      .then((data) => {
        setBackendStatus({ isConfigured: Boolean(data.isConfigured), checked: true });
      })
      .catch(() => {
        setBackendStatus({ isConfigured: false, checked: true, offline: true });
      });
  }, []);

  // Handle initial prompt from Dashboard banner or Learn page
  useEffect(() => {
    if (initialPrompt) {
      handleSend(initialPrompt);
      if (onClearInitialPrompt) onClearInitialPrompt();
    }
  }, [initialPrompt]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (textToSend) => {
    const query = textToSend || inputVal;
    if (!query.trim() || isLoading) return;

    const userMsg = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      time: 'Just now',
      text: query.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query.trim(),
        }),
      });

      const data = await response.json();

      if (response.status === 503 || data.status === 'unconfigured') {
        const unconfiguredMsg = {
          id: `msg-bot-${Date.now()}`,
          sender: 'genie',
          time: 'Just now',
          isWarning: true,
          text: `⚠️ **AI Tutor Service is Not Configured**\n\nThe backend server received your question, but no genuine LLM provider key (**GEMINI_API_KEY**) is configured in the backend environment.\n\nTo ensure data integrity and avoid fabricated financial claims, simulated or fake responses have been disabled in Phase 0.\n\n**To enable live AI answers:**\n1. Open \`.env\` in the project root or \`backend/.env\`.\n2. Add your Google Gemini key: \`GEMINI_API_KEY=your_key_here\`\n3. Restart the backend server (\`npm run dev:backend\`).`,
        };
        setMessages((prev) => [...prev, unconfiguredMsg]);
      } else if (!response.ok || data.status === 'error') {
        const errorMsg = {
          id: `msg-bot-${Date.now()}`,
          sender: 'genie',
          time: 'Just now',
          isWarning: true,
          text: `❌ **Error Contacting AI Provider**\n\n${data.error || data.message || 'An error occurred while contacting the AI service.'}`,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } else {
        const botMsg = {
          id: `msg-bot-${Date.now()}`,
          sender: 'genie',
          time: 'Just now',
          text: data.reply,
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (err) {
      const networkErrorMsg = {
        id: `msg-bot-${Date.now()}`,
        sender: 'genie',
        time: 'Just now',
        isWarning: true,
        text: `🔌 **Backend Service Unreachable**\n\nCould not reach \`/api/ai/chat\`. Ensure the WealthGenie backend server is running:\n\n\`\`\`bash\nnpm run start:backend\n\`\`\`\n\n*(Error: ${err.message})*`,
      };
      setMessages((prev) => [...prev, networkErrorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: 'msg-0',
        sender: 'genie',
        time: 'Just now',
        text: `Conversation reset! What Indian personal finance concept would you like to explore?`,
      },
    ]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-genie-700 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Financial Education Tutor</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
            Ask WealthGenie
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Backend-grounded financial explanations for Indian beginners. Zero fake keyword simulations.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {backendStatus.checked && (
            <Badge variant={backendStatus.isConfigured ? 'green' : 'amber'} size="xs">
              {backendStatus.isConfigured ? 'LLM Live' : 'API Key Setup Required'}
            </Badge>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Safety & Non-Advisory Callout */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
        <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="font-semibold">Educational Literacy Notice:</strong> WealthGenie answers are generated for financial literacy and conceptual understanding only. We do not provide SEBI-registered advisory services, portfolio management, or individual stock recommendations.
        </p>
      </div>

      {/* Chat Container */}
      <Card padding="none" className="flex flex-col h-[560px] overflow-hidden">
        {/* Messages Scroll Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-canvas/30">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                className={`flex items-start gap-3 ${
                  isUser ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-navy-900 text-white'
                      : m.isWarning
                      ? 'bg-amber-600 text-white'
                      : 'bg-genie-700 text-white shadow-2xs'
                  }`}
                >
                  {isUser ? (
                    <User className="w-4 h-4" />
                  ) : m.isWarning ? (
                    <AlertTriangle className="w-4 h-4 text-amber-100" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-genie-200" />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-navy-900 text-white rounded-tr-xs'
                      : m.isWarning
                      ? 'bg-amber-50 text-amber-950 border border-amber-200 shadow-subtle rounded-tl-xs'
                      : 'bg-white text-navy-900 border border-slate-200/90 shadow-subtle rounded-tl-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5 text-[11px] opacity-75">
                    <span className="font-semibold">
                      {isUser ? 'You' : m.isWarning ? 'System Setup Status' : 'WealthGenie AI Tutor'}
                    </span>
                    <span>{m.time}</span>
                  </div>

                  <div className="whitespace-pre-line text-xs sm:text-sm">
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-genie-700 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-genie-200" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs px-4 py-3 shadow-subtle">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-genie-600 animate-bounce"></span>
                  <span className="w-2 h-2 rounded-full bg-genie-600 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 rounded-full bg-genie-600 animate-bounce [animation-delay:0.4s]"></span>
                  <span className="text-xs text-slate-500 ml-1.5 font-medium">
                    Consulting financial literacy knowledge base...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Prompt Suggestions Bar */}
        <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-[11px] font-semibold text-slate-400 shrink-0">Popular questions:</span>
          {SAMPLE_AI_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(prompt)}
              className="text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:border-genie-500 hover:text-genie-800 rounded-full px-3 py-1 whitespace-nowrap transition-colors shadow-2xs shrink-0"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            disabled={isLoading}
            placeholder="Ask a financial question (e.g., 'What is a Nifty 50 Index Fund?', 'How do I start an SIP?')..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-genie-500 focus:ring-2 focus:ring-genie-100 transition-all disabled:opacity-60"
            aria-label="Your financial question"
          />
          <button
            type="submit"
            disabled={!inputVal.trim() || isLoading}
            className="p-2.5 bg-genie-600 hover:bg-genie-700 disabled:opacity-40 disabled:hover:bg-genie-600 text-white rounded-xl transition-colors shadow-2xs"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </Card>
    </div>
  );
}
