export const SIZE_ORDER: Record<string, number> = {
  XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, FREE: 7,
};

export const sizeSort = (a: string, b: string): number =>
  (SIZE_ORDER[a] ?? 99) - (SIZE_ORDER[b] ?? 99);
