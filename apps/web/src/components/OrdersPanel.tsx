import { useState } from 'react';
import { ChevronRight, Package } from 'lucide-react';
import type { Order } from '@parcelguard/contracts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ChatCards';
import { formatMinor } from '@/lib/format';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'processing' | 'shipped';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'processing', label: 'Processing' },
  { id: 'shipped', label: 'Shipped' },
];

/**
 * Left column (Design.md §5.3). Filters are local to the fetched list — they
 * add no API parameters. Only authorized orders are ever in this list.
 */
export function OrdersPanel({
  orders,
  isLoading,
  isError,
  onRetry,
  selectedOrderId,
  onSelect,
}: {
  orders: Order[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedOrderId: string | null;
  onSelect: (order: Order) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = (orders ?? []).filter((order) => filter === 'all' || order.status === filter);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-card">
      <header className="flex-none border-b border-border p-4">
        <h2 className="font-semibold tracking-tight">
          My orders{' '}
          {orders && <span className="text-muted-foreground">({orders.length})</span>}
        </h2>
        <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Filter orders">
          {FILTERS.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant={filter === entry.id ? 'default' : 'ghost'}
              aria-pressed={filter === entry.id}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading && (
          <ul className="space-y-3" aria-hidden="true">
            {[0, 1].map((key) => (
              <li key={key} className="rounded-card border border-border p-3">
                <div className="flex gap-3">
                  <Skeleton className="size-12 rounded-[10px]" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <div className="p-2 text-sm">
            <p>We couldn’t load your orders.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && visible.length === 0 && (
          <div className="p-2 text-sm">
            <p className="text-muted-foreground">No orders match this filter.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFilter('all')}>
              Clear filter
            </Button>
          </div>
        )}

        <ul className="space-y-3">
          {visible.map((order) => (
            <li key={order.id}>
              {/* One accessible button per row — no nested interactive elements. */}
              <button
                type="button"
                onClick={() => onSelect(order)}
                aria-current={selectedOrderId === order.id ? 'true' : undefined}
                className={cn(
                  'flex w-full items-start gap-3 rounded-card border p-3 text-left transition-colors duration-150',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  selectedOrderId === order.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-muted/60',
                )}
              >
                <span
                  className="flex size-12 flex-none items-center justify-center rounded-[10px] bg-muted text-muted-foreground"
                  aria-hidden="true"
                >
                  <Package className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {order.items[0]?.name ?? 'Order'}
                    {order.items[0] ? ` × ${order.items[0].quantity}` : ''}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {order.id} · {formatMinor(order.total_minor)}
                  </span>
                  <span className="mt-2 block">
                    <StatusBadge status={order.status} />
                  </span>
                </span>
                <ChevronRight
                  className="mt-1 size-4 flex-none text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
