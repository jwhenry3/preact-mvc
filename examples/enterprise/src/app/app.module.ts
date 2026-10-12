import { Module, RouterModule } from '@preact-mvc/core';
import { FakeApi } from '@/services/fake-api.service';
import { ThemeService } from '@/services/theme.service';
import { QueryModule } from '@/lib/query.module';
import { routes } from './routes';
import { ShellView } from './shell';
import { DashboardView } from '@/pages/dashboard.view';
import { UsersView } from '@/pages/users.view';
import { SettingsView } from '@/pages/settings.view';
import { ComponentsView } from '@/pages/components.view';

@Module({
  imports: [QueryModule.forRoot(), RouterModule.forRoot(routes)],
  providers: [FakeApi, ThemeService],
  components: [DashboardView, UsersView, SettingsView, ComponentsView],
  bootstrap: [ShellView],
})
export class AppModule {}
