
export function arrify <T> (value: T | T[] | undefined | null): T[] {
  return value == null ? []
    : Array.isArray(value) ? value
    : [value]
}

export function removeBy <T> (array: T[], predicate: (item: T) => boolean): number {
  let n = 0
  let idx = -1
  while ((idx = array.findIndex(predicate)) >= 0) {
    array.splice(idx, 1)
    n++
  }
  return n
}
