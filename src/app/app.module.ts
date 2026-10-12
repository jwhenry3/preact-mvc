import { Module, RouterModule } from '@preact-mvc/core';
import { AppShell } from './app.shell';
import { routes } from './app.routes';
import { API_URL, APP_TITLE } from './core/tokens';

@Module({
  imports: [RouterModule.forRoot(routes)],
  providers: [
    { provide: API_URL, useValue: 'https://api.example.com' },
    { provide: APP_TITLE, useValue: 'MVC + Modules + JSX' },
  ],
  bootstrap: [AppShell],
})
export class AppModule {}
