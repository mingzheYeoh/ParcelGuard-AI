import { useState } from 'react';
import type { Order } from '@parcelguard/contracts';
import { AppHeader } from '@/components/AppHeader';
import { OrdersPanel } from '@/components/OrdersPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { ActivityPanel } from '@/components/ActivityPanel';
import { OrderSummaryCard } from '@/components/ChatCards';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { IS_MOCK } from '@/lib/env';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { ChatEntry } from '@/hooks/useWorkspace';

/**
 * Support workspace (Design.md §5). Three columns at ≥1280px, orders + chat
 * from 900px with activity in a sheet, and chat-only below 900px with both
 * panels reachable as sheets.
 */
export default function App() {
  const workspace = useWorkspace();
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const orders = workspace.orders.data?.items;
  const actions = workspace.actions.data?.items;
  const notReady = workspace.conversationId === null;

  const ordersPanel = (
    <OrdersPanel
      orders={orders}
      isLoading={workspace.orders.isPending && !notReady}
      isError={workspace.orders.isError}
      onRetry={() => void workspace.orders.refetch()}
      selectedOrderId={detailOrder?.id ?? null}
      onSelect={(order) => {
        setDetailOrder(order);
        setOrdersOpen(false);
      }}
    />
  );

  const activityPanel = (
    <ActivityPanel actions={actions} isLoading={workspace.actions.isPending && !notReady} />
  );

  if (workspace.initError) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader displayName={undefined} integration={undefined} />
        <main className="mx-auto flex max-w-[520px] flex-1 flex-col justify-center gap-4 p-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">We couldn’t start the demo</h1>
          <p className="text-sm text-muted-foreground">{workspace.initError.message}</p>
          <div>
            <Button onClick={() => void workspace.retryInit()}>Try again</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        displayName={workspace.bootstrap.data?.customer.display_name}
        integration={workspace.bootstrap.data?.integration}
      />

      <main className="mx-auto grid h-[calc(100dvh-64px)] w-full max-w-[1600px] grid-cols-1 gap-5 p-3 min-[900px]:grid-cols-[244px_minmax(0,1fr)] min-[900px]:p-6 xl:grid-cols-[264px_minmax(0,1fr)_300px]">
        <div className="hidden min-h-0 min-[900px]:block">{ordersPanel}</div>

        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {IS_MOCK && (
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                Demo mode · Simulated responses
              </Badge>
            )}
            <div className="ml-auto flex gap-2 min-[900px]:hidden">
              <Button variant="outline" size="sm" onClick={() => setOrdersOpen(true)}>
                Orders
              </Button>
              <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)}>
                Activity
              </Button>
            </div>
            <div className="ml-auto hidden min-[900px]:flex xl:hidden">
              <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)}>
                Activity
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <ChatPanel
              entries={workspace.entries}
              proposalStatuses={workspace.proposalStatuses}
              sending={workspace.sending}
              busy={workspace.busy}
              disabled={notReady}
              onSend={(content) => void workspace.send(content)}
              onRetry={(entry: ChatEntry) => void workspace.send(entry.content, entry.id)}
              onConfirm={(proposalId) => workspace.confirmProposal.mutate(proposalId)}
              onCancel={(proposalId) => workspace.cancelProposal.mutate(proposalId)}
              onViewOrder={(order) => setDetailOrder(order)}
              onNewConversation={() => workspace.newConversation.mutate()}
            />
          </div>
        </div>

        <div className="hidden min-h-0 xl:block">{activityPanel}</div>
      </main>

      {/* Below 900px the orders list is a sheet. */}
      <Sheet open={ordersOpen} onOpenChange={setOrdersOpen}>
        <SheetContent side="left" className="w-[min(420px,100vw)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>My orders</SheetTitle>
            <SheetDescription>Your authorized orders</SheetDescription>
          </SheetHeader>
          <div className="h-full p-3">{ordersPanel}</div>
        </SheetContent>
      </Sheet>

      {/* Below 1280px activity is a sheet. */}
      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent className="w-[min(420px,100vw)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Recent actions</SheetTitle>
            <SheetDescription>What happened in this conversation</SheetDescription>
          </SheetHeader>
          <div className="h-full p-3">{activityPanel}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={detailOrder !== null} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <SheetContent className="w-[min(420px,100vw)] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailOrder?.id ?? 'Order'}</SheetTitle>
            <SheetDescription>Synthetic order details</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {detailOrder && (
              <OrderSummaryCard order={detailOrder} onViewDetails={() => undefined} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
