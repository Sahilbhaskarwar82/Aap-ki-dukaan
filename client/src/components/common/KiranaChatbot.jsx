import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { sendChatMessage } from '@/api/chat.api';

const QUICK_ACTIONS = [
  { label: '📦 Track Orders', prompt: 'Where is my order?' },
  { label: '💳 Payment & Refunds', prompt: 'Check my payment and refund status' },
  { label: '🛒 Suggest Products', prompt: 'Suggest products for my store' },
  { label: '🔥 Active Deals', prompt: 'Show active group buy pools' },
];

const DEFAULT_PROMPTS = [
  'How does Group Buying save money?',
  'What is the 20% Retailer MOQ rule?',
  'What happens if a pool doesn\'t reach MOQ?',
  'Where is my order?',
  'Check my payment and refund status',
  'Suggest products for my store',
];

export function KiranaChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Namaste! 🙏 Welcome to **Aap Ki Dukan Copilot**.\n\nI can assist you with:\n• 📦 **Track Orders**: Real-time status of your bulk allocations & delivery milestones.\n• 💳 **Payments & Refunds**: Verify PayPal transactions & automated tier price-drop savings.\n• 🛒 **Suggest Products**: Tailored wholesale recommendations for high-margin Kirana staples.\n• 👥 **Group Buys**: 20% Retailer MOQ math and collective procurement rules.\n\nHow can I help your store today?",
      suggestedPrompts: [
        "Where is my order?",
        "Check my payment and refund status",
        "Suggest products for my store",
        "How does Group Buying save money?",
      ],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  const handleSend = async (textToSend) => {
    const rawQuery = (textToSend || input).trim();
    if (!rawQuery || loading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: rawQuery,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const history = newMessages.map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const res = await sendChatMessage({
        message: rawQuery,
        history,
      });

      const botMsg = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        text: res.reply || 'I am currently unable to process your request. Please try again shortly.',
        suggestedPrompts: res.suggestedPrompts || DEFAULT_PROMPTS.slice(0, 4),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          role: 'assistant',
          text: '⚠️ Sorry, I encountered a temporary network issue. Please explore active Group Buys or Wholesaler Catalogues from the navigation menu.',
          suggestedPrompts: DEFAULT_PROMPTS.slice(0, 3),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        text: 'Chat cleared! How can I assist your Kirana store today?',
        suggestedPrompts: [
          'Where is my order?',
          'Check my payment and refund status',
          'Suggest products for my store',
          'How does Group Buying save money?',
        ],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const renderFormattedText = (text) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let content = line;
      const parts = content.split(/(\*\*.*?\*\*|`.*?`)/g);
      const renderedParts = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={pIdx}
              className="px-1 py-0.5 rounded bg-slate-950 font-mono text-teal-300 text-[11px]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      });

      if (line.startsWith('• ') || line.startsWith('- ')) {
        return (
          <div key={idx} className="flex items-start gap-1.5 my-0.5">
            <span className="text-teal-400 font-bold shrink-0">•</span>
            <span>{renderedParts.slice(1)}</span>
          </div>
        );
      }
      if (/^\d+\.\s/.test(line)) {
        return (
          <div key={idx} className="my-1 pl-1">
            {renderedParts}
          </div>
        );
      }
      return (
        <p key={idx} className={line.trim() === '' ? 'h-2' : 'my-0.5'}>
          {renderedParts}
        </p>
      );
    });
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 print:hidden font-sans">
      {/* ── Chat Window ── */}
      {isOpen && (
        <div
          data-testid="chatbot-window"
          className="mb-3 w-[380px] sm:w-[420px] h-[560px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] bg-midnight-card/95 backdrop-blur-xl border border-midnight-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          role="dialog"
          aria-label="Kirana AI Copilot Chat"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-midnight-surface/90 border-b border-midnight-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-md">
                  <Bot className="h-4 w-4" />
                </div>
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-midnight-surface animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white tracking-wide">Aap Ki Dukan Copilot</h3>
                  <span className="text-[10px] bg-teal-500/20 text-teal-300 font-medium px-1.5 py-0.2 rounded border border-teal-500/30">
                    AI
                  </span>
                </div>
                <p className="text-[10px] text-midnight-muted">Kirana &amp; Wholesale Assistant</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearChat}
                title="Clear Conversation"
                className="p-1 rounded-md text-midnight-muted hover:text-white hover:bg-midnight-card transition-colors"
                aria-label="Clear chat"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close Chat"
                data-testid="chatbot-close-btn"
                className="p-1 rounded-md text-midnight-muted hover:text-white hover:bg-midnight-card transition-colors"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Action Pills */}
          <div className="px-3 py-1.5 bg-midnight-bg/70 border-b border-midnight-border/50 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
            {QUICK_ACTIONS.map((action, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(action.prompt)}
                className="shrink-0 px-2 py-0.5 rounded-full bg-midnight-surface/80 border border-midnight-border hover:border-teal-400 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                {action.label}
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div
            data-testid="chatbot-messages"
            className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-xs text-midnight-text scrollbar-thin scrollbar-thumb-midnight-border"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-end gap-1.5 max-w-[88%]">
                  {m.role === 'assistant' && (
                    <div className="h-6 w-6 rounded-full bg-teal-900/60 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0 mb-1">
                      <Sparkles className="h-3 w-3" />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-3.5 py-2.5 shadow-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-br-none'
                        : 'bg-midnight-surface border border-midnight-border text-slate-200 rounded-bl-none'
                    }`}
                  >
                    {renderFormattedText(m.text)}
                  </div>
                </div>

                <span className="text-[9px] text-midnight-muted px-1.5 mt-1">{m.time}</span>

                {/* Suggested prompt chips */}
                {m.role === 'assistant' && m.suggestedPrompts && m.suggestedPrompts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-7">
                    {m.suggestedPrompts.map((prompt, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-midnight-card border border-teal-500/30 text-teal-300 hover:bg-teal-950/40 hover:border-teal-400 transition-all text-left cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-midnight-muted text-[11px] pl-1">
                <div className="h-5 w-5 rounded-full bg-teal-900/40 border border-teal-500/30 flex items-center justify-center text-teal-300 animate-spin">
                  <Sparkles className="h-2.5 w-2.5" />
                </div>
                <span>Checking live records...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-2.5 bg-midnight-surface/80 border-t border-midnight-border"
          >
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                data-testid="chatbot-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about orders, refunds, products, MOQ..."
                className="flex-1 bg-midnight-card border border-midnight-border rounded-xl px-3 py-2 text-xs text-white placeholder:text-midnight-muted focus:outline-none focus:border-teal-500 transition-colors"
                disabled={loading}
              />
              <button
                type="submit"
                data-testid="chatbot-send-btn"
                disabled={!input.trim() || loading}
                className="h-8 w-8 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shrink-0 cursor-pointer"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1 text-[9px] text-center text-midnight-muted flex items-center justify-center gap-1">
              <ShieldCheck className="h-2.5 w-2.5 text-teal-400" />
              <span>Aap Ki Dukan 24/7 Procurement Copilot</span>
            </div>
          </form>
        </div>
      )}

      {/* ── Trigger Button ── */}
      {!isOpen && (
        <button
          type="button"
          data-testid="chatbot-trigger-btn"
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-medium shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 hover:scale-105 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-teal-400 cursor-pointer"
          aria-label="Open Kirana AI Copilot"
        >
          <div className="relative">
            <Bot className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 animate-ping" />
          </div>
          <span className="text-xs font-bold tracking-wide">Kirana AI</span>
          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-mono">
            Copilot
          </span>
        </button>
      )}
    </div>
  );
}

export default KiranaChatbot;
