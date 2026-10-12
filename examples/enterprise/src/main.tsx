import { bootstrap } from '@preact-mvc/core';
import { AppModule } from './app/app.module';
import './styles.css';

bootstrap(AppModule, document.getElementById('app')!);
