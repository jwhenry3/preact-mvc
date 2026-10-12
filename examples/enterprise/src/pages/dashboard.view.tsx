import { Component, View, inject, signal } from '@preact-mvc/core';
import { QueryClient } from '@tanstack/preact-query';
import { formatDistanceToNow } from 'date-fns';
import { TrendingUp, TrendingDown, DollarSign, Users as UsersIcon, ShoppingCart, Activity } from 'lucide-preact';
import { Island } from '@preact-mvc/atoll-island';
import type { WorkerLike } from '@preact-mvc/atoll-island';
import { FakeApi } from '@/services/fake-api.service';
import { ThemeService } from '@/services/theme.service';
import { querySignal } from '@/lib/query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Skeleton } from '@/ui/misc';
import { Chart } from '@/ui/chart';
import { Avatar } from '@/ui/misc';

const ICONS = [DollarSign, UsersIcon, ShoppingCart, Activity];

// Bundler-detectable worker entry — literal new URL so Vite sees it.
const tickerEntry = (): WorkerLike =>
  new Worker(new URL('../workers/ticker.worker.tsx', import.meta.url), {
    type: 'module',
  }) as WorkerLike;

@Component()
export class DashboardView extends View {
  private api = inject(FakeApi);
  private qc = inject(QueryClient);
  private theme = inject(ThemeService);

  // Signal-backed queries — the observer lives on this view's scope.
  private metrics = querySignal(this.qc, {
    queryKey: ['metrics'],
    queryFn: () => this.api.metrics(),
  });
  private revenue = querySignal(this.qc, {
    queryKey: ['revenue'],
    queryFn: () => this.api.revenueSeries(),
  });
  private activity = querySignal(this.qc, {
    queryKey: ['activity'],
    queryFn: () => this.api.activity(),
  });

  private lastPing = signal('');

  render() {
    const dark = this.theme.resolved.value === 'dark';
    return (
      <div class="space-y-6">
        {/* Stat cards */}
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {this.metrics.value.isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} class="h-28" />)
            : (this.metrics.value.data ?? []).map((m, i) => {
                const Icon = ICONS[i];
                const up = m.delta >= 0;
                return (
                  <Card key={m.label}>
                    <CardHeader class="flex flex-row items-center justify-between pb-2">
                      <CardDescription class="text-sm font-medium">{m.label}</CardDescription>
                      <Icon size={16} class="text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div class="text-2xl font-bold">
                        {m.label === 'Revenue' ? `$${m.value.toLocaleString()}` : m.value.toLocaleString()}
                      </div>
                      <Badge variant={up ? 'success' : 'destructive'} class="mt-1">
                        {up ? <TrendingUp size={12} class="mr-1" /> : <TrendingDown size={12} class="mr-1" />}
                        {Math.abs(m.delta)}%
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Revenue chart */}
          <Card class="xl:col-span-2">
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Trailing 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              {this.revenue.value.isLoading ? (
                <Skeleton class="h-64 w-full" />
              ) : (
                <Chart
                  dark={dark}
                  option={{
                    xAxis: {
                      type: 'category',
                      data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                      axisLine: { show: false },
                      axisTick: { show: false },
                    },
                    yAxis: { type: 'value', splitLine: { lineStyle: { opacity: 0.15 } } },
                    series: [
                      {
                        type: 'line',
                        data: this.revenue.value.data,
                        smooth: true,
                        symbol: 'none',
                        areaStyle: { opacity: 0.15 },
                        lineStyle: { width: 2.5 },
                        color: 'hsl(221 83% 53%)',
                      },
                    ],
                    grid: { left: 50, right: 12, top: 12, bottom: 28 },
                    tooltip: { trigger: 'axis' },
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Activity feed */}
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Latest events across the workspace</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              {this.activity.value.isLoading
                ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} class="h-8" />)
                : (this.activity.value.data ?? []).map((a) => (
                    <div key={a.id} class="flex items-start gap-3">
                      <Avatar name={a.actor} class="h-7 w-7" />
                      <div class="text-sm min-w-0">
                        <span class="font-medium">{a.actor}</span>{' '}
                        <span class="text-muted-foreground">{a.action}</span>
                        <div class="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  ))}
            </CardContent>
          </Card>
        </div>

        {/* Worker island — a render loop living on another thread */}
        <Card>
          <CardHeader>
            <CardTitle>Worker island</CardTitle>
            <CardDescription>
              Rendered by a Web Worker via the islands package — ticking entirely off the main thread.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Island
              worker={tickerEntry}
              app="ticker"
              onEvent={(n, p) => (this.lastPing.value = `${n} ${JSON.stringify(p)}`)}
            />
            {this.lastPing.value && (
              <div class="mt-3 text-xs text-muted-foreground">
                emit() → shell: <code>{this.lastPing.value}</code>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
}
