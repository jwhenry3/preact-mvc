import { Component, View, inject, signal } from '@preact-mvc/core';
import { QueryClient } from '@tanstack/preact-query';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, Search } from 'lucide-preact';
import { FakeApi, type User } from '@/services/fake-api.service';
import { querySignal } from '@/lib/query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Input } from '@/ui/input';
import { Button } from '@/ui/button';
import { Skeleton, Avatar } from '@/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table';

const STATUS: Record<User['status'], 'success' | 'warning' | 'destructive'> = {
  active: 'success',
  invited: 'warning',
  suspended: 'destructive',
};

@Component()
export class UsersView extends View {
  private api = inject(FakeApi);
  private qc = inject(QueryClient);

  /** Debounced search text — the query key. Typing doesn't spam the API. */
  private search = signal('');
  private debounceTimer?: ReturnType<typeof setTimeout>;

  // Options GETTER: runs inside a scope-bound effect, so search signal
  // writes re-key the same observer — reactive keys, no manual re-arm.
  private users = querySignal(this.qc, () => ({
    queryKey: ['users', this.search.value],
    queryFn: () => this.api.users(this.search.value),
  }));

  private onSearch = (e: Event): void => {
    const v = (e.target as HTMLInputElement).value;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => (this.search.value = v), 250);
  };

  private refresh = (): void => {
    void this.qc.invalidateQueries({ queryKey: ['users'] });
  };

  render() {
    const res = this.users.value;
    const rows = res.data ?? [];
    return (
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                TanStack Query through querySignal — the observer lives on this view's scope.
              </CardDescription>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative">
                <Search size={14} class="absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  class="pl-8 w-56"
                  placeholder="Search users..."
                  onInput={this.onSearch}
                />
              </div>
              <Button variant="outline" size="icon" onClick={this.refresh} title="Refresh">
                <RefreshCw size={14} class={res.isFetching ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {res.isError ? (
            <div class="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
              Failed to load users: {String(res.error?.message ?? res.error)}
            </div>
          ) : res.isLoading ? (
            <div class="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} class="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div class="flex items-center gap-3">
                        <Avatar name={u.name} class="h-7 w-7" />
                        <div>
                          <div class="font-medium">{u.name}</div>
                          <div class="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell class="capitalize">{u.role}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS[u.status]}>{u.status}</Badge>
                    </TableCell>
                    <TableCell class="text-muted-foreground">
                      {formatDistanceToNow(new Date(u.lastActive), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell class="text-center text-muted-foreground py-8">
                      No users match "{this.search.value}"
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {res.isFetching && !res.isLoading && (
            <div class="mt-2 text-xs text-muted-foreground">refreshing…</div>
          )}
        </CardContent>
      </Card>
    );
  }
}
