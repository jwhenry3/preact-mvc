import { Component, View, inject } from '@preact-mvc/core';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, Search } from 'lucide-preact';
import { UsersController } from './users.controller';
import type { User } from '@/services/fake-api.service';
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

/**
 * The view is a pure projection: UsersController owns the debounced
 * search key, the query observer, and refresh — render() binds inputs to
 * `c.*` and maps status → badge variant.
 */
@Component({ controllers: [UsersController] })
export class UsersView extends View {
  private c = inject(UsersController);

  render() {
    const c = this.c;
    const res = c.users.value;
    const rows = res.data ?? [];
    return (
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                TanStack Query through querySignal — the observer lives on the controller's scope.
              </CardDescription>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative">
                <Search size={14} class="absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  class="pl-8 w-56"
                  placeholder="Search users..."
                  onInput={(e) => c.setSearch((e.target as HTMLInputElement).value)}
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => c.refresh()} title="Refresh">
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
                      No users match "{c.search.value}"
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
