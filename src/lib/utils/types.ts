

type DependencyField = "dependencies" | "devDependencies"

/**
.* Matches any [primitive value](https://developer.mozilla.org/en-US/docs/Glossary/Primitive).
 */
type Primitive = null | undefined | string | number | boolean | symbol | bigint

/**
 * Matches any primitive, `void`, `Date`, or `RegExp` value.
 */
type BuiltIns = Primitive | void | Date | RegExp

/**
 * Same as `ReadonlyDeep`, but accepts only `ReadonlyMap`s as inputs. Internal helper for `ReadonlyDeep`.
 */
type ReadonlyMapDeep<KeyType, ValueType> = {} & Readonly<
  ReadonlyMap<ReadonlyDeep<KeyType>, ReadonlyDeep<ValueType>>
>

/**
 * Same as `ReadonlyDeep`, but accepts only `ReadonlySet`s as inputs. Internal helper for `ReadonlyDeep`.
 */
type ReadonlySetDeep<ItemType> = {} & Readonly<ReadonlySet<ReadonlyDeep<ItemType>>>

/**
 * Same as `ReadonlyDeep`, but accepts only `object`s as inputs. Internal helper for `ReadonlyDeep`.
 */
type _ReadonlyObjectDeep<ObjectType extends object> = {
  readonly [KeyType in keyof ObjectType]: ReadonlyDeep<ObjectType[KeyType]>
}

type ReadonlyDeep<T> = T extends BuiltIns
  ? T
  : T extends new (...arguments_: any[]) => unknown
    ? T
    : T extends (...arguments_: any[]) => unknown
      ? T
      : T extends Readonly<ReadonlyMap<infer KeyType, infer ValueType>>
        ? ReadonlyMapDeep<KeyType, ValueType>
        : T extends Readonly<ReadonlySet<infer ItemType>>
          ? ReadonlySetDeep<ItemType>
          : // Identify tuples to avoid converting them to arrays inadvertently; special case `readonly [...never[]]`, as it emerges undesirably from recursive invocations of ReadonlyDeep below.
            T extends readonly [] | readonly [...never[]]
            ? readonly []
            : T extends readonly [infer U, ...infer V]
              ? readonly [ReadonlyDeep<U>, ...ReadonlyDeep<V>]
              : T extends readonly [...infer U, infer V]
                ? readonly [...ReadonlyDeep<U>, ReadonlyDeep<V>]
                : T extends ReadonlyArray<infer ItemType>
                  ? ReadonlyArray<ReadonlyDeep<ItemType>>
                  : T extends object
                    ? _ReadonlyObjectDeep<T>
                    : unknown

export type { ReadonlyDeep }
