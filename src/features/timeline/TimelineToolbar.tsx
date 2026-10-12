import { Button } from '@/components/common/Button';
import { msToTimeDetailed } from '@/utils/timeFormat';

interface TimelineToolbarProps {
  playheadMs: number;
  durationMs: number;
  isPlaying: boolean;
  isBusy: boolean;
  canSplit: boolean;
  splitDisabledReason?: string;
  canDelete: boolean;
  deleteDisabledReason?: string;
  canUndo: boolean;
  canRedo: boolean;
  onTogglePlayback: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3.5 2.5h3v11h-3zm6 0h3v11h-3z" />
    </svg>
  ) : (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2.25 13 8l-9 5.75z" />
    </svg>
  );
}

function timelineTime(ms: number, totalMs: number): string {
  const formatted = msToTimeDetailed(ms).slice(0, -4);
  return totalMs >= 3_600_000 ? formatted : formatted.slice(3);
}

export function TimelineToolbar(props: TimelineToolbarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--border-color)] px-3 py-2">
      <Button
        size="sm"
        onClick={props.onTogglePlayback}
        disabled={props.durationMs <= 0}
        aria-label={props.isPlaying ? '暂停时间线' : '播放时间线'}
        title={props.isPlaying ? '暂停时间线（Space）' : '播放时间线（Space）'}
        data-testid="timeline-play-toggle"
        className="inline-flex items-center gap-1.5"
      >
        <PlayIcon playing={props.isPlaying} />
        {props.isPlaying ? '暂停' : '播放'}
      </Button>
      <div
        className="min-w-[132px] font-mono text-xs tabular-nums text-[var(--text-secondary)]"
        data-testid="timeline-time"
      >
        {timelineTime(props.playheadMs, props.durationMs)} /{' '}
        {timelineTime(props.durationMs, props.durationMs)}
      </div>
      <div className="h-5 w-px bg-[var(--border-color)]" aria-hidden="true" />
      <Button
        size="sm"
        onClick={props.onSplit}
        disabled={!props.canSplit || props.isBusy}
        data-testid="timeline-split"
        title={!props.canSplit || props.isBusy ? props.splitDisabledReason : '在播放头处切分（S）'}
      >
        切分 <span className="ml-1 opacity-60">S</span>
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={props.onDelete}
        disabled={!props.canDelete || props.isBusy}
        data-testid="timeline-delete"
        title={!props.canDelete || props.isBusy ? props.deleteDisabledReason : '删除选中片段（Delete）'}
      >
        删除
      </Button>
      <div className="h-5 w-px bg-[var(--border-color)]" aria-hidden="true" />
      <Button size="sm" onClick={props.onUndo} disabled={!props.canUndo || props.isBusy} aria-label="撤销" title="撤销（Cmd/Ctrl+Z）">
        撤销
      </Button>
      <Button size="sm" onClick={props.onRedo} disabled={!props.canRedo || props.isBusy} aria-label="重做" title="重做（Cmd/Ctrl+Shift+Z）">
        重做
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" onClick={props.onZoomOut} aria-label="缩小时间线" title="缩小时间线">−</Button>
        <Button size="sm" onClick={props.onFit} title="将完整时间线适应视口">适应</Button>
        <Button size="sm" onClick={props.onZoomIn} aria-label="放大时间线" title="放大时间线">＋</Button>
      </div>
    </div>
  );
}
