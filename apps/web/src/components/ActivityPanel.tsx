import { useState } from 'react';
import { AlertCircle, CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react';
import type { Action } from '@parcelguard/contracts';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatTimestamp } from '@/lib/format';

const OUTCOME_ICON = {
  allowed: CheckCircle2,
  denied: ShieldAlert,
  failed: AlertCircle,
  outcome_unknown: HelpCircle,
} as const;

const OUTCOME_TONE = {
  allowed: 'text-emerald-700',
  denied: 'text-amber-700',
  failed: 'text-destructive',
  outcome_unknown: 'text-amber-700',
} as const;

/**
 * Right column (Design.md §5.5). Real records only — no KPIs, success rates,
 * or invented activity counts.
 */
export function ActivityPanel({
  actions,
  isLoading,
}: {
  actions: Action[] | undefined;
  isLoading: boolean;
}) {
  const [selected, setSelected] = useState<Action | null>(null);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-card">
      <header className="flex-none border-b border-border p-4">
        <h2 className="font-semibold tracking-tight">Recent actions</h2>
        <p className="mt-1 text-xs text-muted-foreground">What happened in this conversation</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading && (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!isLoading && (actions ?? []).length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            Your order actions will appear here.
          </p>
        )}

        <ul className="space-y-2">
          {(actions ?? []).map((action) => {
            const Icon = OUTCOME_ICON[action.outcome];
            return (
              <li key={action.id}>
                <button
                  type="button"
                  onClick={() => setSelected(action)}
                  className="flex w-full gap-3 rounded-card border border-transparent p-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon
                    className={`mt-0.5 size-4 flex-none ${OUTCOME_TONE[action.outcome]}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{action.summary}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatTimestamp(action.created_at)}
                      {' · '}
                      <span className="break-all">{action.reason_code}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-[min(420px,100vw)] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.summary ?? 'Action'}</SheetTitle>
            <SheetDescription>
              {selected ? formatTimestamp(selected.created_at) : ''}
            </SheetDescription>
          </SheetHeader>

          {selected && (
            <div className="space-y-4 px-4 pb-6 text-sm">
              <dl className="space-y-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Outcome</dt>
                  <dd className="font-medium">{selected.outcome.replace('_', ' ')}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd className="break-all font-mono text-xs">{selected.reason_code}</dd>
                </div>
              </dl>

              <Separator />

              {/* Technical evidence is secondary; a missing reference never
                  gets a verified checkmark (Design.md §5.5). */}
              <details className="rounded-card border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Technical evidence
                </summary>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd>{selected.evidence.source}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Agent identity</dt>
                    <dd className="break-all">{selected.evidence.agent_did ?? 'Not available'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Provider reference</dt>
                    <dd className="break-all">
                      {selected.evidence.provider_reference ?? 'Not available'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Verified</dt>
                    <dd>{selected.evidence.verified ? 'Verified' : 'Not verified'}</dd>
                  </div>
                </dl>
              </details>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
