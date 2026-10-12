/** Type-level prop inference for island mounts. */
export type IslandAppProps<A> = A extends string
  ? Record<string, unknown>
  : A extends { islandAppName: string }
    ? A extends { __props?: infer P }
      ? P
      : Record<string, unknown>
    : A extends (props: infer P) => unknown
      ? P
      : A extends { imperative: (doc: never, props: infer P) => void }
        ? P
        : A extends new (...args: never[]) => unknown
          ? Record<string, unknown>
          : Record<string, unknown>;
