type Bounds = { y: number; height: number };
export function visibleRows(
  bounds: ReadonlyMap<string, Bounds>,
  offset: number,
  height: number,
  ids: Iterable<string>,
) {
  if (height <= 0) return [];
  return [...ids].filter((id) => {
    const row = bounds.get(id);
    if (!row || row.height <= 0) return false;
    const overlap =
      Math.min(row.y + row.height, offset + height) - Math.max(row.y, offset);
    return overlap >= Math.min(24, row.height / 2);
  });
}
