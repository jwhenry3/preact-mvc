import { Injectable } from '@preact-mvc/core';

@Injectable()
export class ThemeService {
  accent = '#673ab8';
  headingStyle = { color: this.accent };
}
