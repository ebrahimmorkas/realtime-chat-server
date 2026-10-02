import { SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';

/** Matches the server's MAX_MESSAGE_LENGTH. */
export const MAX_LENGTH = 4000;
/** "typing:stop" is sent after this long without a keystroke. */
const TYPING_IDLE_MS = 2500;

interface Props {
  onSend: (text: string) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}

export function Composer({ onSend, onTyping, disabled }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const typing = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stopTyping = () => {
    clearTimeout(idleTimer.current);
    if (typing.current) {
      typing.current = false;
      onTyping(false);
    }
  };

  // Tell others we stopped typing when leaving the conversation mid-sentence.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopTyping, []);

  // Grow with the content up to a few lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const change = (value: string) => {
    setText(value);
    if (!value.trim()) return stopTyping();
    if (!typing.current) {
      typing.current = true;
      onTyping(true);
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_LENGTH) return;
    onSend(trimmed);
    setText('');
    stopTyping();
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const remaining = MAX_LENGTH - text.length;

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative flex-1">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          aria-label="Message"
          placeholder="Type a message"
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={stopTyping}
          className="block max-h-40 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[0.9375rem] placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800"
        />
        {remaining < 200 && (
          <span
            className={`absolute right-3 bottom-1 text-[0.6875rem] ${remaining < 0 ? 'text-red-600' : 'text-slate-400'}`}
          >
            {remaining}
          </span>
        )}
      </div>
      <Button
        type="submit"
        size="icon"
        className="size-11 shrink-0 rounded-full"
        aria-label="Send message"
        disabled={disabled || !text.trim() || remaining < 0}
      >
        <SendHorizontal />
      </Button>
    </form>
  );
}
