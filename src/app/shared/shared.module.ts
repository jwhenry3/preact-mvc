import { Module } from '@preact-mvc/core';
import { ThemeService } from './theme.service';

@Module({
  providers: [ThemeService],
})
export class SharedModule {}
