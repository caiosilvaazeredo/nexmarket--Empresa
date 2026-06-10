import { useEffect, useRef, useState } from 'react';
import { Send, Lock, StickyNote } from 'lucide-react';
import { cn } from '../lib/utils';
import { timeAgo } from '../lib/format';
import { Button } from './ui/Button';

export interface ChatBubble {
  id: string;
  text: string;
  mine: boolean;
  author?: string;
  time?: any;
  internal?: boolean;
  system?: boolean;
}

export function ChatPanel({
  messages,
  onSend,
  allowInternal,
  placeholder = 'Escreva uma mensagem…',
  emptyHint = 'Nenhuma mensagem ainda.',
  macros,
  className,
}: {
  messages: ChatBubble[];
  onSend: (text: string, internal: boolean) => void | Promise<void>;
  allowInternal?: boolean;
  placeholder?: string;
  emptyHint?: string;
  macros?: { title: string; body: string }[];
  className?: string;
}) {
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      await onSend(t, internal);
      setText('');
      setInternal(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn('flex flex-col bg-slate-50 dark:bg-slate-950 rounded-2xl border-2 border-slate-100 dark:border-slate-800', className)}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-8">{emptyHint}</p>
        )}
        {messages.map((m) =>
          m.system ? (
            <div key={m.id} className="text-center">
              <span className="inline-block px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 text-xs font-medium">
                {m.text}
              </span>
            </div>
          ) : (
            <div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[78%]')}>
                {!m.mine && m.author && (
                  <span className="block text-[11px] font-bold text-slate-400 mb-0.5 ml-1">{m.author}</span>
                )}
                <div
                  className={cn(
                    'px-3.5 py-2 rounded-2xl text-sm font-medium shadow-sm',
                    m.internal
                      ? 'bg-warn-soft text-amber-800 border border-amber-200'
                      : m.mine
                      ? 'bg-brand text-white rounded-br-md'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-bl-md border border-slate-100 dark:border-slate-700',
                  )}
                >
                  {m.internal && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase mb-0.5 opacity-80">
                      <Lock className="w-3 h-3" /> Nota interna
                    </span>
                  )}
                  {m.text}
                </div>
                <span className={cn('block text-[10px] text-slate-400 mt-0.5', m.mine ? 'text-right mr-1' : 'ml-1')}>
                  {timeAgo(m.time)}
                </span>
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {macros && macros.length > 0 && (
        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto">
          {macros.map((mc) => (
            <button
              key={mc.title}
              onClick={() => setText((t) => (t ? t + ' ' : '') + mc.body)}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 hover:border-brand"
            >
              {mc.title}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 border-t-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-2xl">
        {allowInternal && (
          <label className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
              className="accent-amber-500"
            />
            <StickyNote className="w-3.5 h-3.5" /> Nota interna (não enviada ao usuário)
          </label>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={internal ? 'Escreva uma nota interna…' : placeholder}
            className="flex-1 resize-none px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-brand font-medium text-sm text-slate-700 dark:text-slate-100 max-h-32"
          />
          <Button size="icon" onClick={submit} disabled={sending || !text.trim()} className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
