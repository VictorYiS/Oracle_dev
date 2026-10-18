// Deterministic A* on the 4-neighbour grid. Ties break on f, then h, then tile index,
// so the same world always yields the same path on every platform.

export interface Grid {
  width: number;
  height: number;
  /** Cost to enter a tile, or 0 if it cannot be entered. */
  cost(tile: number): number;
}

/** Tiles to walk from `from` to `to`, excluding `from`. Empty if already there; null if unreachable. */
export function findPath(grid: Grid, from: number, to: number): number[] | null {
  if (from === to) return [];
  if (grid.cost(to) === 0) return null;
  const { width, height } = grid;
  const size = width * height;
  const g = new Int32Array(size).fill(-1);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const tx = to % width;
  const ty = Math.floor(to / width);
  const h = (t: number) => Math.abs((t % width) - tx) + Math.abs(Math.floor(t / width) - ty);

  // Binary heap of [f, h, tile].
  const heap: [number, number, number][] = [];
  const less = (a: [number, number, number], b: [number, number, number]) =>
    a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
  const push = (item: [number, number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i]!, heap[p]!)) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    return top;
  };

  g[from] = 0;
  push([h(from), h(from), from]);
  while (heap.length > 0) {
    const [, , cur] = pop();
    if (closed[cur]) continue;
    if (cur === to) {
      const path: number[] = [];
      for (let t = to; t !== from; t = came[t]!) path.push(t);
      return path.reverse();
    }
    closed[cur] = 1;
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    // Fixed neighbour order: up, left, right, down.
    const neighbours = [
      cy > 0 ? cur - width : -1,
      cx > 0 ? cur - 1 : -1,
      cx < width - 1 ? cur + 1 : -1,
      cy < height - 1 ? cur + width : -1,
    ];
    for (const next of neighbours) {
      if (next < 0 || closed[next]) continue;
      const step = grid.cost(next);
      if (step === 0) continue;
      const cost = g[cur]! + step;
      if (g[next]! !== -1 && cost >= g[next]!) continue;
      g[next] = cost;
      came[next] = cur;
      push([cost + h(next), h(next), next]);
    }
  }
  return null;
}
