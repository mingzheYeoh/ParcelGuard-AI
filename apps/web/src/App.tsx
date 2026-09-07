import { useQuery } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { healthResponseSchema } from '@parcelguard/contracts';
import { cn } from '@/lib/utils';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const apiMode = import.meta.env.VITE_API_MODE ?? 'mock';

async function fetchHealth() {
  const response = await fetch(`${apiBaseUrl}/health`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
  const body = (await response.json()) as { data: unknown };
  return healthResponseSchema.parse(body.data);
}

/**
 * Task 1 scaffold placeholder. The real workspace (header, orders, chat,
 * recent actions) is implemented in Task 3 per Design.md §12.
 */
export default function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col justify-center gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
          <PackageCheck className="size-5" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">ParcelGuard AI</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Monorepo scaffold (TASKS.md Task 1). The support workspace UI is built in Task 3. All
        orders, customers and addresses are synthetic.
      </p>

      <section
        className={cn(
          'rounded-card border border-border bg-card p-5 text-sm',
          'shadow-[0_1px_2px_rgb(23_35_43/6%)]',
        )}
      >
        <h2 className="text-sm font-semibold">
          GET {apiBaseUrl}/health <span className="text-muted-foreground">· mode: {apiMode}</span>
        </h2>
        <pre className="mt-3 overflow-x-auto rounded-control bg-muted p-3 font-mono text-xs">
          {health.isPending
            ? 'Loading…'
            : health.isError
              ? `Unavailable — ${health.error.message}`
              : JSON.stringify(health.data, null, 2)}
        </pre>
      </section>
    </main>
  );
}
