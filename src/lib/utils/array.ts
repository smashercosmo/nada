class ExtendedArray<T> extends Array<T> {
  public static override from<T>(iterable: Iterable<T> | ArrayLike<T>) {
    return new ExtendedArray(...Array.from(iterable))
  }

  public isEmpty() {
    return this.length === 0
  }

  public isNotEmpty() {
    return this.length !== 0
  }

  /**
   * Named from the similar function in `lodash`.
   */
  public compact() {
    return this.filter(item => item !== undefined)
  }

  override concat(...items: ConcatArray<T>[]) {
    super.concat(...items);
    return this;
  }

  public unique() {
    const unique = new Set(this)

    let index = 0
    for (const value of unique) {
      this[index++] = value
    }

    this.length = unique.size
    return this
  }
}

interface ExtendedArray<T> {
  map<U>(callback: (value: T, index: number, array: T[]) => U, thisArg?: any): ExtendedArray<U>
  filter<S extends T>(
    predicate: (value: T, index: number, array: T[]) => value is S,
    thisArg?: any,
  ): ExtendedArray<S>
  filter(
    predicate: (value: T, index: number, array: T[]) => unknown,
    thisArg?: any,
  ): ExtendedArray<T>
}

export { ExtendedArray }
