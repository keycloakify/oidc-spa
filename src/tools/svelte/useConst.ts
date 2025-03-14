export function useConst<T>(getValue: () => T): T {
  const value = getValue();
  return value;
}
