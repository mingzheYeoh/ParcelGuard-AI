import { PackageCheck } from 'lucide-react';
import type { IntegrationStatus } from '@parcelguard/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/**
 * Header (Design.md §5.2). The customer view carries no framework versions,
 * database names, or credentials; integration detail lives behind Demo details.
 */
export function AppHeader({
  displayName,
  integration,
}: {
  displayName: string | undefined;
  integration: IntegrationStatus | undefined;
}) {
  const initial = displayName?.trim().charAt(0).toUpperCase() ?? 'A';

  return (
    <header className="flex h-16 flex-none items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
      <span
        className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <PackageCheck className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold tracking-tight">ParcelGuard AI</p>
        <p className="truncate text-xs text-muted-foreground">Support workspace</p>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Badge variant="outline" className="hidden sm:inline-flex">
          Synthetic orders
        </Badge>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              Demo details
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(420px,100vw)] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Demo details</SheetTitle>
              <SheetDescription>
                Every order, customer, and address in this workspace is synthetic.
              </SheetDescription>
            </SheetHeader>

            <dl className="space-y-4 px-4 pb-6 text-sm">
              <div>
                <dt className="font-medium">Assistant model</dt>
                <dd className="text-muted-foreground">
                  {integration ? describeMode(integration.model.mode) : 'Not available'}
                  {integration?.model.provider ? ` · ${integration.model.provider}` : ''}
                  {integration?.model.deployment ? ` · ${integration.model.deployment}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Terminal 3</dt>
                <dd className="text-muted-foreground">
                  {integration ? describeMode(integration.terminal3.mode) : 'Not available'}
                </dd>
                <dd className="text-muted-foreground">
                  Agent identity:{' '}
                  {integration?.terminal3.agent_did ?? 'Not available'}
                  {' · '}
                  {integration?.terminal3.identity_verified ? 'Verified' : 'Not verified'}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Order data</dt>
                <dd className="text-muted-foreground">
                  Synthetic fixtures. No real customer data is stored or displayed.
                </dd>
              </div>
            </dl>
          </SheetContent>
        </Sheet>

        <Avatar className="size-8">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

/** Modes are reported separately and never merged into one "Live" claim. */
function describeMode(mode: IntegrationStatus['model']['mode']): string {
  if (mode === 'live') return 'Connected';
  if (mode === 'mock') return 'Demo mode · simulated responses';
  return 'Not connected';
}
