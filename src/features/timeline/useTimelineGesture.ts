import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { EditOperationV1 } from '@/types/project';
import { pixelsToTime } from './layout';
import {
  createMoveOperationAtTimeline,
  createTrimOperation,
  hasExceededDragThreshold,
} from './plans';
import type {
  SourceBounds,
  TimelineGestureDraft,
  TimelineLayoutItem,
} from './types';

type PendingGesture =
  | {
      kind: 'move';
      pointerId: number;
      captureTarget: HTMLElement;
      startClientX: number;
      clipId: string;
      active: boolean;
      operation: EditOperationV1 | null;
    }
  | {
      kind: 'trim';
      pointerId: number;
      captureTarget: HTMLElement;
      startClientX: number;
      edge: 'in' | 'out';
      item: TimelineLayoutItem;
      bounds: SourceBounds;
      active: boolean;
      operation: EditOperationV1 | null;
    };

interface UseTimelineGestureOptions {
  layout: readonly TimelineLayoutItem[];
  pixelsPerMs: number;
  trackRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  onCommit: (operation: EditOperationV1, reason: string) => Promise<unknown>;
}

export function useTimelineGesture(options: UseTimelineGestureOptions) {
  const { layout, pixelsPerMs, trackRef, disabled, onCommit } = options;
  const [draft, setDraft] = useState<TimelineGestureDraft | null>(null);
  const pendingRef = useRef<PendingGesture | null>(null);
  const draftRef = useRef<TimelineGestureDraft | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const latestMoveRef = useRef<{ pointerId: number; clientX: number } | null>(null);

  const updateDraft = useCallback((next: TimelineGestureDraft | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const cancel = useCallback(() => {
    if (moveRafRef.current !== null) cancelAnimationFrame(moveRafRef.current);
    moveRafRef.current = null;
    latestMoveRef.current = null;
    const pending = pendingRef.current;
    if (pending?.captureTarget.hasPointerCapture(pending.pointerId)) {
      pending.captureTarget.releasePointerCapture(pending.pointerId);
    }
    pendingRef.current = null;
    updateDraft(null);
  }, [updateDraft]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pendingRef.current) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', cancel);
    };
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  const beginMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>, clipId: string) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pendingRef.current = {
        kind: 'move',
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
        startClientX: event.clientX,
        clipId,
        active: false,
        operation: null,
      };
    },
    [disabled]
  );

  const beginTrim = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      item: TimelineLayoutItem,
      edge: 'in' | 'out',
      bounds: SourceBounds
    ) => {
      if (disabled || event.button !== 0 || item.kind !== 'source') return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      pendingRef.current = {
        kind: 'trim',
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
        startClientX: event.clientX,
        edge,
        item,
        bounds,
        active: false,
        operation: null,
      };
    },
    [disabled]
  );

  const movePointer = useCallback(
    (pointerId: number, clientX: number) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== pointerId) return;
      const deltaPx = clientX - pending.startClientX;
      if (!pending.active && !hasExceededDragThreshold(deltaPx)) return;
      pending.active = true;

      if (pending.kind === 'trim') {
        const original = pending.edge === 'in' ? pending.item.sourceInMs : pending.item.sourceOutMs;
        const requestedSourceMs = original + pixelsToTime(deltaPx, pixelsPerMs);
        const operation = createTrimOperation({
          item: pending.item,
          edge: pending.edge,
          requestedSourceMs,
          bounds: pending.bounds,
        });
        pending.operation = operation;
        if (!operation || operation.op !== 'trim_clip') {
          updateDraft(null);
          return;
        }
        updateDraft({
          kind: 'trim',
          edge: pending.edge,
          clipId: pending.item.clipId,
          sourceInMs: operation.source_in_ms,
          sourceOutMs: operation.source_out_ms,
        });
        return;
      }

      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const timelineMs = pixelsToTime(clientX - rect.left, pixelsPerMs);
      const result = createMoveOperationAtTimeline(layout, pending.clipId, timelineMs);
      if (!result || result.operation.op !== 'move_clip') {
        pending.operation = null;
        updateDraft(null);
        return;
      }
      pending.operation = result.operation;
      updateDraft({
        kind: 'move',
        clipId: pending.clipId,
        anchorClipId: result.operation.anchor_clip_id,
        position: result.operation.position,
        orderedClipIds: result.orderedClipIds,
      });
    },
    [layout, pixelsPerMs, trackRef, updateDraft]
  );

  const finishPointer = useCallback(
    (pointerId: number) => {
      const latest = latestMoveRef.current;
      if (latest?.pointerId === pointerId) {
        if (moveRafRef.current !== null) cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = null;
        latestMoveRef.current = null;
        movePointer(pointerId, latest.clientX);
      }
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== pointerId) return;
      const operation = pending.active ? pending.operation : null;
      if (pending.captureTarget.hasPointerCapture(pending.pointerId)) {
        pending.captureTarget.releasePointerCapture(pending.pointerId);
      }
      pendingRef.current = null;
      if (!operation) {
        updateDraft(null);
        return;
      }
      const reason = operation.op === 'move_clip' ? 'Timeline clip reorder' : 'Timeline clip trim';
      void onCommit(operation, reason)
        .catch(() => undefined)
        .finally(() => updateDraft(null));
    },
    [movePointer, onCommit, updateDraft]
  );

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      latestMoveRef.current = { pointerId: event.pointerId, clientX: event.clientX };
      if (moveRafRef.current !== null) return;
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = null;
        const latest = latestMoveRef.current;
        latestMoveRef.current = null;
        if (latest) movePointer(latest.pointerId, latest.clientX);
      });
    };
    const handleUp = (event: PointerEvent) => finishPointer(event.pointerId);
    const handleCancel = (event: PointerEvent) => {
      if (pendingRef.current?.pointerId === event.pointerId) cancel();
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [cancel, finishPointer, movePointer]);

  return {
    draft,
    beginMove,
    beginTrim,
    cancelGesture: cancel,
  };
}
