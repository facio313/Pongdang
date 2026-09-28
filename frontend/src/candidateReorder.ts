export interface CandidateRowBox {
  id: number;
  top: number;
  height: number;
}

/** Keep DOM slots fixed while the grabbed row and its neighbours slide. */
export function candidateRowOffsets(rows: readonly CandidateRowBox[], from: number, to: number): number[] {
  const source = rows.findIndex((row) => row.id === from);
  const target = rows.findIndex((row) => row.id === to);
  const offsets = rows.map(() => 0);
  if (source < 0 || target < 0 || source === target) return offsets;
  const picked = rows[source];
  offsets[source] = target < source
    ? rows[target].top - picked.top
    : rows[target].top + rows[target].height - picked.height - picked.top;
  for (let index = Math.min(source, target); index <= Math.max(source, target); index += 1) {
    if (index !== source) offsets[index] = target < source ? picked.height : -picked.height;
  }
  return offsets;
}

/** Crossing a neighbour's middle opens its slot, including unequal-height rows. */
export function candidateDragPreview(rows: readonly CandidateRowBox[], from: number, distance: number) {
  const source = rows.findIndex((row) => row.id === from);
  if (source < 0) return { to: from, offsets: rows.map(() => 0) };
  const picked = rows[source];
  const first = rows[0];
  const last = rows[rows.length - 1];
  const offset = Math.max(first.top - picked.top,
    Math.min(distance, last.top + last.height - picked.top - picked.height));
  let target = source;
  if (offset > 0) {
    while (target + 1 < rows.length && picked.top + picked.height + offset > rows[target + 1].top + rows[target + 1].height / 2) target += 1;
  } else {
    while (target > 0 && picked.top + offset < rows[target - 1].top + rows[target - 1].height / 2) target -= 1;
  }
  const to = rows[target].id;
  const offsets = candidateRowOffsets(rows, from, to);
  offsets[source] = offset;
  return { to, offsets };
}
