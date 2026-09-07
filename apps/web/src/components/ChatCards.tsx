import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  MapPin,
  Package,
  ShieldAlert,
} from 'lucide-react';
import type { ActionResultCard as ActionResultCardData, Order, ProposalStatus } from '@parcelguard/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCountdown, formatMinor, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Order status badge tone. shadcn Badge has no success variant by default. */
export function StatusBadge({ status }: { status: Order['status'] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize',
        status === 'processing' && 'border-primary/30 bg-primary/10 text-primary',
        status === 'shipped' && 'border-sky-600/30 bg-sky-50 text-sky-800',
        status === 'delivered' && 'border-emerald-600/30 bg-emerald-50 text-emerald-800',
      )}
    >
      {status}
    </Badge>
  );
}

export function OrderSummaryCard({
  order,
  onViewDetails,
}: {
  order: Order;
  onViewDetails: (order: Order) => void;
}) {
  return (
    <article className="rounded-card border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold tracking-tight">{order.id}</h3>
        <StatusBadge status={order.status} />
      </header>

      <ul className="mt-3 space-y-1 text-sm">
        {order.items.map((item) => (
          <li key={item.name} className="flex justify-between gap-4">
            <span className="min-w-0 break-words">
              {item.name} × {item.quantity}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatMinor(item.unit_price_minor * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-medium">
        <span>Total</span>
        <span className="tabular-nums">{formatMinor(order.total_minor)}</span>
      </p>

      {order.timeline.length > 0 && (
        <ol className="mt-4 space-y-3">
          {order.timeline.map((event, index) => {
            const isCurrent = index === order.timeline.length - 1;
            return (
              <li key={`${event.status}-${event.occurred_at}`} className="flex gap-3">
                <span className="relative flex flex-col items-center" aria-hidden="true">
                  <span
                    className={cn(
                      'mt-1 size-2 rounded-full',
                      isCurrent ? 'bg-primary' : 'bg-border',
                    )}
                  />
                  {index < order.timeline.length - 1 && (
                    <span className="mt-1 w-px flex-1 bg-border" />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-sm',
                      isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {event.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatTimestamp(event.occurred_at)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <Button variant="outline" size="sm" className="mt-4" onClick={() => onViewDetails(order)}>
        View order details
      </Button>
    </article>
  );
}

const PROPOSAL_PRESENTATION: Record<
  ProposalStatus,
  { tone: string; label: string; note: string }
> = {
  pending: { tone: 'border-border', label: 'Awaiting confirmation', note: '' },
  executing: { tone: 'border-border', label: 'Updating address…', note: '' },
  succeeded: {
    tone: 'border-emerald-600/30 bg-emerald-50/60',
    label: 'Address updated',
    note: 'The saved address on this order has been updated.',
  },
  cancelled: { tone: 'border-border bg-muted/40', label: 'Cancelled', note: 'No change was made.' },
  expired: {
    tone: 'border-amber-500/40 bg-amber-50/70',
    label: 'Proposal expired',
    note: 'This request expired. Please ask again.',
  },
  denied: {
    tone: 'border-amber-500/40 bg-amber-50/70',
    label: 'Cannot update this order',
    note: '',
  },
  failed: {
    tone: 'border-destructive/40 bg-destructive/5',
    label: 'Could not update address',
    note: 'Nothing was changed.',
  },
  outcome_unknown: {
    tone: 'border-amber-500/40 bg-amber-50/70',
    label: 'Update status not confirmed',
    note: 'The request was sent but the result is unknown. Check Recent actions before trying again.',
  },
};

export function AddressChangeProposalCard({
  orderId,
  fromLabel,
  toLabel,
  expiresAt,
  status,
  busy,
  onConfirm,
  onCancel,
}: {
  orderId: string;
  fromLabel: string;
  toLabel: string;
  expiresAt: string;
  status: ProposalStatus;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Pending cards expire against the live clock (Design.md §8.2).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'pending') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const expired = new Date(expiresAt).getTime() <= now;
  const effective: ProposalStatus = status === 'pending' && expired ? 'expired' : status;
  const presentation = PROPOSAL_PRESENTATION[effective];
  const actionable = effective === 'pending';

  return (
    <article className={cn('rounded-card border bg-card p-4', presentation.tone)}>
      <header className="flex items-center gap-2">
        <MapPin className="size-4 text-primary" aria-hidden="true" />
        <h3 className="font-semibold tracking-tight">Confirm address change</h3>
      </header>

      <p className="mt-3 text-sm">
        <span className="font-medium">{orderId}</span>
        <span className="mx-2 text-muted-foreground" aria-label="changing from, to">
          {fromLabel} → {toLabel}
        </span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This change applies to your saved address.
      </p>

      <p className="mt-3 text-xs font-medium" aria-live="polite">
        {effective === 'pending' ? (
          <span className="text-muted-foreground">Expires {formatCountdown(expiresAt, now)}</span>
        ) : (
          <span>{presentation.label}</span>
        )}
      </p>
      {presentation.note && (
        <p className="mt-1 text-xs text-muted-foreground">{presentation.note}</p>
      )}

      {(actionable || effective === 'executing') && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button
            className="sm:flex-none"
            disabled={!actionable || busy}
            onClick={onConfirm}
            aria-describedby={busy ? undefined : undefined}
          >
            {effective === 'executing' ? 'Updating…' : 'Confirm change'}
          </Button>
          <Button
            variant="outline"
            className="sm:flex-none"
            disabled={!actionable || busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      )}
    </article>
  );
}

const RESULT_PRESENTATION = {
  allowed: { Icon: CheckCircle2, tone: 'border-emerald-600/30 bg-emerald-50/60 text-emerald-900' },
  denied: { Icon: ShieldAlert, tone: 'border-amber-500/40 bg-amber-50/70 text-amber-950' },
  failed: { Icon: AlertCircle, tone: 'border-destructive/40 bg-destructive/5 text-foreground' },
  outcome_unknown: { Icon: HelpCircle, tone: 'border-amber-500/40 bg-amber-50/70 text-amber-950' },
} as const;

export function ActionResultCard({ card }: { card: ActionResultCardData }) {
  const { Icon, tone } = RESULT_PRESENTATION[card.outcome];
  const isPermission = card.reason_code === 'ORDER_UNAVAILABLE';

  return (
    <article className={cn('rounded-card border p-4', tone)}>
      <header className="flex items-center gap-2">
        {isPermission ? (
          <ShieldAlert className="size-4" aria-hidden="true" />
        ) : card.reason_code === 'ORDER_NOT_EDITABLE' ? (
          <Package className="size-4" aria-hidden="true" />
        ) : (
          <Icon className="size-4" aria-hidden="true" />
        )}
        <h3 className="font-semibold tracking-tight">{card.title}</h3>
      </header>
      <p className="mt-2 text-sm">{card.description}</p>
      <p className="mt-2 font-mono text-[11px] break-all text-muted-foreground">
        {card.reason_code}
      </p>
    </article>
  );
}
