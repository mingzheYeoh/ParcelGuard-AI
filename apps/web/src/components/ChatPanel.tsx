import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Bot, Package, RefreshCw, SendHorizontal } from 'lucide-react';
import type { Order, ProposalStatus } from '@parcelguard/contracts';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ActionResultCard,
  AddressChangeProposalCard,
  OrderSummaryCard,
} from '@/components/ChatCards';
import type { ChatEntry } from '@/hooks/useWorkspace';
import { cn } from '@/lib/utils';

const MAX_CONTENT = 2000;

const CHIPS = [
  { label: 'Track my order', message: 'Where is order ORD-1001?' },
  { label: 'Update delivery address', message: 'Send ORD-1002 to my office instead.' },
  { label: 'What can you help with?', message: 'What can you help with?' },
];

/**
 * Center column (Design.md §5.4). The welcome block disappears after the first
 * message; nothing is preloaded, so a screenshot always shows real interactions.
 */
export function ChatPanel({
  entries,
  proposalStatuses,
  sending,
  busy,
  disabled,
  onSend,
  onRetry,
  onConfirm,
  onCancel,
  onViewOrder,
  onNewConversation,
}: {
  entries: ChatEntry[];
  proposalStatuses: Record<string, ProposalStatus>;
  sending: boolean;
  busy: boolean;
  disabled: boolean;
  onSend: (content: string) => void;
  onRetry: (entry: ChatEntry) => void;
  onConfirm: (proposalId: string) => void;
  onCancel: (proposalId: string) => void;
  onViewOrder: (order: Order) => void;
  onNewConversation: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Autoscroll only when the reader is already near the bottom, so scrolling
  // back through a transcript is not yanked away (Design.md §5.4).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !atBottom) return;
    list.scrollTop = list.scrollHeight;
  }, [entries, atBottom]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-border bg-card">
      <header className="flex h-16 flex-none items-center gap-3 border-b border-border px-4">
        <span
          className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Bot className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">ParcelGuard Assistant</p>
          <p className="truncate text-xs text-muted-foreground">Order support</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={onNewConversation}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          New conversation
        </Button>
      </header>

      <div
        ref={listRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {entries.length === 0 ? (
          <div className="mx-auto flex max-w-[520px] flex-col items-center py-6 text-center sm:py-12">
            <span
              className="flex size-12 items-center justify-center rounded-[14px] bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Package className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">
              How can I help with your order?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Track a delivery or update a saved address before your order ships.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {CHIPS.map((chip) => (
                <Button
                  key={chip.label}
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onSend(chip.message)}
                >
                  {chip.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-5">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn('flex flex-col', entry.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200',
                    entry.role === 'user'
                      ? 'max-w-[80%] rounded-card bg-primary/10 px-4 py-2.5 text-sm'
                      : 'max-w-[92%] text-sm',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{entry.content}</p>
                </div>

                {entry.failure && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">
                    <span>{entry.failure.message}</span>
                    {entry.failure.retryable && (
                      <Button size="sm" variant="outline" onClick={() => onRetry(entry)}>
                        Retry
                      </Button>
                    )}
                  </p>
                )}

                {entry.cards.length > 0 && (
                  <div className="mt-3 w-full max-w-[92%] space-y-3">
                    {entry.cards.map((card, index) => {
                      if (card.type === 'order_summary') {
                        return (
                          <OrderSummaryCard
                            key={`${entry.id}-${index}`}
                            order={card.order}
                            onViewDetails={onViewOrder}
                          />
                        );
                      }
                      if (card.type === 'address_change_proposal') {
                        return (
                          <AddressChangeProposalCard
                            key={`${entry.id}-${index}`}
                            orderId={card.order_id}
                            fromLabel={card.from_address_label}
                            toLabel={card.to_address_label}
                            expiresAt={card.expires_at}
                            status={proposalStatuses[card.proposal_id] ?? card.status}
                            busy={busy}
                            onConfirm={() => onConfirm(card.proposal_id)}
                            onCancel={() => onCancel(card.proposal_id)}
                          />
                        );
                      }
                      return <ActionResultCard key={`${entry.id}-${index}`} card={card} />;
                    })}
                  </div>
                )}
              </li>
            ))}
            {sending && (
              <li className="text-sm text-muted-foreground" aria-live="polite">
                Checking your request…
              </li>
            )}
          </ol>
        )}
      </div>

      {!atBottom && entries.length > 0 && (
        <div className="pointer-events-none relative">
          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto absolute -top-12 left-1/2 -translate-x-1/2 shadow-sm"
            onClick={() => {
              setAtBottom(true);
              const list = listRef.current;
              if (list) list.scrollTop = list.scrollHeight;
            }}
          >
            <ArrowDown className="size-4" aria-hidden="true" />
            New messages
          </Button>
        </div>
      )}

      <Composer disabled={disabled || sending} onSend={onSend} />
    </section>
  );
}

function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState('');
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const remaining = MAX_CONTENT - [...value].length;

  // Auto-grow between 56 and 144px (Design.md §5.4).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(144, Math.max(56, el.scrollHeight))}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_CONTENT || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div className="flex-none border-t border-border p-4">
      <div className="flex items-end gap-3">
        <Textarea
          ref={textareaRef}
          value={value}
          disabled={disabled}
          aria-label="Message the assistant"
          aria-describedby="composer-hint"
          placeholder="Ask about an order…"
          className="min-h-14 resize-none"
          onChange={(event) => setValue(event.target.value)}
          // An IME composition must never be committed by Enter.
          onCompositionStart={() => (composingRef.current = true)}
          onCompositionEnd={() => (composingRef.current = false)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            if (composingRef.current || event.nativeEvent.isComposing) return;
            event.preventDefault();
            submit();
          }}
        />
        <Button
          size="icon"
          className="size-11 flex-none"
          aria-label="Send message"
          disabled={disabled || value.trim().length === 0 || remaining < 0}
          onClick={submit}
        >
          <SendHorizontal className="size-5" aria-hidden="true" />
        </Button>
      </div>
      <p id="composer-hint" className="mt-2 text-xs text-muted-foreground">
        Enter to send · Shift + Enter for a new line
        {remaining <= 200 && (
          <span className={cn('ml-2', remaining < 0 && 'text-destructive')} aria-live="polite">
            {remaining} characters left
          </span>
        )}
      </p>
    </div>
  );
}
