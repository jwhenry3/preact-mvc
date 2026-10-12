import { Module, RouterModule } from '@preact-mvc/core';
import { SessionService } from '@/services/session.service';
import { ThemeService } from '@/services/theme.service';
import { PageWorkerHost } from '@/services/page-worker.service';
import { FakeApi } from '@/services/fake-api.service';
import { QueryModule } from '@/lib/query.module';
import { routes } from './routes';
import { ShellView } from './shell';

@Module({
  imports: [QueryModule.forRoot(), RouterModule.forRoot(routes)],
  // FakeApi is registered explicitly: unregistered @Injectable classes do
  // not auto-resolve, and the main-thread dashboard's controller injects it.
  providers: [SessionService, ThemeService, PageWorkerHost, FakeApi],
  bootstrap: [ShellView],
})
export class AppModule {}
