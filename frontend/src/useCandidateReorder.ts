import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { candidateDragPreview, candidateRowOffsets, type CandidateRowBox } from "./candidateReorder.ts";

interface MeasuredRow extends CandidateRowBox { element: HTMLElement }
interface Reordering {
  rows: MeasuredRow[];
  list: HTMLDivElement;
  handle: HTMLButtonElement;
  from: number;
  to: number;
  pointerId: number | null;
  startY: number;
  clientY: number;
  phase: "dragging" | "settling";
  frame: number;
  timer: number;
  finish: (commit: boolean) => void;
}

const SETTLE_MS = 220;
const offsetsToStyle = (rows: MeasuredRow[], offsets: number[]) => {
  rows.forEach((row, index) => row.element.style.setProperty("--rd-reorder-y", `${offsets[index]}px`));
};

/** Pointer capture keeps mouse, touch and pen on the same animated list path. */
export function useCandidateReorder(onMove: (from: number, to: number) => void, revision: unknown) {
  const listRef = useRef<HTMLDivElement>(null);
  const active = useRef<Reordering | null>(null);

  // A new list/selection or navigation cannot commit an old in-flight gesture.
  useEffect(() => () => { active.current?.finish(false); }, [revision]);

  const settle = (commit: boolean) => {
    const drag = active.current;
    if (!drag || drag.phase !== "dragging") return;
    drag.phase = "settling";
    cancelAnimationFrame(drag.frame);
    if (drag.pointerId !== null && drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }
    drag.list.dataset.settling = "true";
    offsetsToStyle(drag.rows, candidateRowOffsets(drag.rows, drag.from, commit ? drag.to : drag.from));
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : SETTLE_MS;
    drag.timer = window.setTimeout(() => drag.finish(commit), duration);
  };

  const begin = (handle: HTMLButtonElement, from: number, pointerId: number | null, clientY: number) => {
    const list = listRef.current;
    if (!list || active.current) return null;
    const rows = [...list.querySelectorAll<HTMLElement>(".rd-step[data-spot-id]")].map((element) => {
      const box = element.getBoundingClientRect();
      return { id: Number(element.dataset.spotId), top: box.top + window.scrollY, height: box.height, element };
    });
    const picked = rows.find((row) => row.id === from);
    if (!picked || rows.length < 2) return null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      settle(false);
    };
    const onBlur = () => settle(false);
    const drag: Reordering = {
      rows, list, handle, from, to: from, pointerId, clientY,
      startY: clientY + window.scrollY, phase: "dragging", frame: 0, timer: 0,
      finish: (commit) => {
        if (active.current !== drag) return;
        active.current = null;
        cancelAnimationFrame(drag.frame);
        window.clearTimeout(drag.timer);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("blur", onBlur);
        if (drag.pointerId !== null && handle.hasPointerCapture(drag.pointerId)) handle.releasePointerCapture(drag.pointerId);
        // Remove transitions before resetting slots and committing the new DOM order.
        delete list.dataset.reordering;
        delete list.dataset.settling;
        delete picked.element.dataset.dragging;
        rows.forEach((row) => row.element.style.removeProperty("--rd-reorder-y"));
        if (commit && drag.from !== drag.to) onMove(drag.from, drag.to);
      },
    };
    active.current = drag;
    list.dataset.reordering = "true";
    picked.element.dataset.dragging = "true";
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return drag;
  };

  const update = (drag: Reordering) => {
    const preview = candidateDragPreview(drag.rows, drag.from, drag.clientY + window.scrollY - drag.startY);
    drag.to = preview.to;
    offsetsToStyle(drag.rows, preview.offsets);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, from: number) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const drag = begin(event.currentTarget, from, event.pointerId, event.clientY);
    if (!drag) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    let previousTime = 0;
    const frame = (time: number) => {
      if (active.current !== drag || drag.phase !== "dragging") return;
      // Scroll only after an intentional move, and only near the viewport edges.
      const elapsed = previousTime ? Math.min(time - previousTime, 32) : 16;
      previousTime = time;
      if (Math.abs(drag.clientY + window.scrollY - drag.startY) > 4) {
        const edge = 64;
        const speed = drag.clientY < edge ? -Math.min(1, (edge - drag.clientY) / edge)
          : drag.clientY > window.innerHeight - edge ? Math.min(1, (drag.clientY - window.innerHeight + edge) / edge) : 0;
        if (speed) window.scrollBy(0, speed * elapsed * 0.65);
      }
      update(drag);
      drag.frame = requestAnimationFrame(frame);
    };
    drag.frame = requestAnimationFrame(frame);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = active.current;
    if (!drag || drag.phase !== "dragging" || drag.pointerId !== event.pointerId) return;
    drag.clientY = event.clientY;
    update(drag);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (active.current?.pointerId !== event.pointerId) return;
    onPointerMove(event);
    settle(true);
  };
  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (active.current?.pointerId === event.pointerId) settle(false);
  };
  const moveWithKeyboard = (handle: HTMLButtonElement, from: number, to: number) => {
    const drag = begin(handle, from, null, 0);
    if (!drag) return;
    drag.to = to;
    // Ensure the lift's initial position is laid out before animating to its slot.
    handle.getBoundingClientRect();
    settle(true);
  };

  return { listRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, moveWithKeyboard };
}
