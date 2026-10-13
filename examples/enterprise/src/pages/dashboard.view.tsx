import { Component, View, inject } from '@preact-mvc/core';
import { formatDistanceToNow } from 'date-fns';
import { TrendingUp, TrendingDown, DollarSign, Users as UsersIcon, ShoppingCart, Activity } from 'lucide-preact';
import { islandComponent } from '@preact-mvc/atoll-island';
import { tickerContract } from '../islands/ticker.contract';
import { chartContract } from '../islands/chart.contract';
import { DashboardController } from './dashboard.controller';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Skeleton } from '@/ui/misc';
import { Avatar } from '@/ui/misc';

const ICONS = [DollarSign, UsersIcon, ShoppingCart, Activity];

// Two threads nested under this page's own worker: each contract's worker
// factory spawns a sub-worker from inside the dashboard worker, and their
// ops tunnel up through this island's stream to the main thread.
const Ticker = islandComponent(tickerContract);
const Chart = islandComponent(chartContract);

@Component({ controllers: [DashboardController] })
export class DashboardView extends View<{ dark?: boolean }> {
  private c = inject(DashboardController);

  render() {
    const c = this.c;
    return (
      <div class="space-y-6">
        {/* Stat cards */}
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {c.metrics.value.isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} class="h-28" />)
            : (c.metrics.value.data ?? []).map((m, i) => {
                const Icon = ICONS[i];
                const v = c.metricView(m);
                return (
                  <Card key={m.label}>
                    <CardHeader class="flex flex-row items-center justify-between pb-2">
                      <CardDescription class="text-sm font-medium">{m.label}</CardDescription>
                      <Icon size={16} class="text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div class="text-2xl font-bold">{v.value}</div>
                      <Badge variant={v.up ? 'success' : 'destructive'} class="mt-1">
                        {v.up ? <TrendingUp size={12} class="mr-1" /> : <TrendingDown size={12} class="mr-1" />}
                        {v.delta}
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
              {c.revenue.value.isLoading ? (
                <Skeleton class="h-64 w-full" />
              ) : (
                /* The chart sub-island's mount div is the h-64 box — the
                   real element's measured size forwards down as the sub-
                   worker's pushed container size, so echarts' SVG init is
                   honest. The query result and theme ride props: 12 numbers
                   and a boolean. `dark` arrived here as a mount prop from
                   the shell (theme lives main-thread). */
                <Chart
                  dark={this.props.dark}
                  data={c.revenue.value.data}
                  className="h-64 w-full"
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
              {c.activity.value.isLoading
                ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} class="h-8" />)
                : (c.activity.value.data ?? []).map((a) => (
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
            <Ticker onEvent={(n, p) => c.onIslandEvent(n, p)} />
            {c.lastPing.value && (
              <div class="mt-3 text-xs text-muted-foreground">
                worker → here: <code>{c.lastPing.value}</code>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
}
