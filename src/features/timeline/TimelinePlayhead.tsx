interface TimelinePlayheadProps {
  leftPx: number;
}

export function TimelinePlayhead({ leftPx }: TimelinePlayheadProps) {
  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-[#f97316]"
      style={{ left: leftPx }}
      data-testid="timeline-playhead"
      aria-hidden="true"
    >
      <div className="absolute -left-1.5 top-0 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-[#f97316]" />
    </div>
  );
}
