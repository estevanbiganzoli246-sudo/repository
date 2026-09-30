import React, { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AICoachView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '¡Hola! Soy tu Entrenador IA en RunWorld 🤖. Estoy aquí para ayudarte a mejorar tus tiempos, planificar tus entrenamientos, resolver dudas sobre nutrición deportiva o evitar lesiones. ¿En qué te puedo ayudar hoy?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input.trim();
    if (!query || loading) return;

    const userMessage: Message = { role: 'user', content: query };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();

      if (data.ok && data.text) {
        setMessages([...newMessages, { role: 'assistant', content: data.text }]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: data.error || 'Lo siento, ocurrió un error al procesar tu consulta con el Entrenador IA.' },
        ]);
      }
    } catch (err: any) {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: 'Error de conexión con el servidor del Entrenador IA.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    '⚡ ¿Cómo bajo mi tiempo en 5K?',
    '🦵 ¿Cómo prevenir el dolor de rodilla?',
    '🍌 ¿Qué comer antes de una tirada larga?',
    '🛌 ¿Cómo mejorar la recuperación post-entreno?',
  ];

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-140px)] pb-20 sm:pb-6 select-none">
      {/* Header Badge */}
      <div className="mb-4 p-4 rounded-3xl bg-gradient-to-r from-emerald-950/80 via-neutral-900 to-neutral-900 border border-emerald-500/40 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold shadow-md shadow-emerald-500/20">
            🤖
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-tight flex items-center gap-2">
              Entrenador IA RunWorld
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono">
                Gemini 3.5 Flash
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              Tu coach personal de running, nutrición y rendimiento 24/7.
            </p>
          </div>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-neutral-800">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                msg.role === 'user'
                  ? 'bg-neutral-800 text-emerald-400 border border-neutral-700'
                  : 'bg-emerald-500 text-neutral-950 shadow-md shadow-emerald-500/20'
              }`}
            >
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>

            <div
              className={`max-w-[82%] sm:max-w-[75%] p-4 rounded-3xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-neutral-800 text-white rounded-tr-sm border border-neutral-700/80'
                  : 'bg-neutral-900/90 text-neutral-100 rounded-tl-sm border border-neutral-800 shadow-lg backdrop-blur-md'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-neutral-950 flex items-center justify-center text-xs font-bold shadow-md shadow-emerald-500/20">
              🤖
            </div>
            <div className="bg-neutral-900/90 border border-neutral-800 px-4 py-3 rounded-3xl rounded-tl-sm text-xs text-neutral-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>El Entrenador IA está redactando su análisis...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      <div className="py-2.5 flex gap-2 overflow-x-auto scrollbar-none">
        {quickPrompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSend(prompt.replace(/^[^\w\s]+/, '').trim())}
            disabled={loading}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-medium transition shadow-sm disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="mt-2 relative">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-2 shadow-xl backdrop-blur-xl focus-within:border-emerald-500/60 transition"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregúntale algo a tu Entrenador IA..."
            disabled={loading}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 font-bold transition shadow-md shadow-emerald-500/20 flex items-center justify-center"
          >
            <svg className="w-4 h-4 fill-current rotate-90" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};
