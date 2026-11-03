import { isView } from './view';
import {
  isController,
  isInjectable,
  getComponentMeta,
  getInjectableMeta,
} from './decorators';
import { getModuleMeta, isModule } from './module';
import { isComponent } from './lazy';

// The framework's class-flag read surface in one place: `pmvc.isView(x)`,
// `pmvc.isController(x)`. Classes are identified by `__x` stamps (see
// decorators.ts for the stamp families); these accessors encode the
// own-vs-inherited rules so callers never touch the raw fields:
//
//   identity, inherited:  isView, isController, isInjectable, isComponent
//   config,   own-class:  isModule, getModuleMeta, getComponentMeta
//   config,   inherited:  getInjectableMeta (Angular's ɵprov rule)
export const pmvc = Object.freeze({
  isView,
  isController,
  isModule,
  isInjectable,
  isComponent,
  getModuleMeta,
  getComponentMeta,
  getInjectableMeta,
});
