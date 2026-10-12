import { Module } from '@preact-mvc/core';
import { CounterView } from './counter.view';

@Module({
  components: [CounterView],
  bootstrap: [CounterView],
})
export class CounterModule {}
