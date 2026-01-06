# Store Usage Examples

Common usage patterns and examples for the Zustand stores.

## Table of Contents
- [Basic Usage](#basic-usage)
- [Editor Operations](#editor-operations)
- [ASR Operations](#asr-operations)
- [UI Operations](#ui-operations)
- [Advanced Patterns](#advanced-patterns)

## Basic Usage

### Importing Stores

```typescript
// Import individual stores
import { useEditorStore } from '@/stores/editorStore';
import { useASRStore } from '@/stores/asrStore';
import { useUIStore } from '@/stores/uiStore';

// Or import from central location
import { useEditorStore, useASRStore, useUIStore } from '@/stores';

// Import types
import type { DisplayMode, Segment, CharUnit } from '@/types';
```

### Selecting State

```typescript
function MyComponent() {
  // Select single value (recommended for performance)
  const displayMode = useEditorStore(state => state.displayMode);

  // Select multiple values
  const { composition, lastSegments, hasEdited } = useEditorStore();

  // Select with derived state
  const segmentCount = useEditorStore(state => state.composition.length);

  return <div>Segments: {segmentCount}</div>;
}
```

## Editor Operations

### 1. Setting Recognition Results

```typescript
function RecognitionHandler() {
  const setRecognitionResult = useEditorStore(state => state.setRecognitionResult);

  const handleRecognitionComplete = (result: ASRResult) => {
    setRecognitionResult(
      result.full_text,
      result.segments,
      result.char_level_data // optional
    );
  };

  return <button onClick={handleRecognitionComplete}>Process</button>;
}
```

### 2. Displaying Segments

```typescript
function SegmentList() {
  const { composition, lastSegments, isCharEditMode } = useEditorStore();

  // Get segments in display order
  const displaySegments = composition.map(idx => lastSegments[idx]);

  return (
    <div>
      {displaySegments.map((segment, idx) => (
        <SegmentItem
          key={idx}
          segment={segment}
          index={idx}
        />
      ))}
    </div>
  );
}
```

### 3. Deleting Segments

```typescript
function SegmentItem({ segment, index }: { segment: Segment; index: number }) {
  const deleteAtPosition = useEditorStore(state => state.deleteAtPosition);

  return (
    <div>
      <span>{segment.text}</span>
      <button onClick={() => deleteAtPosition(index)}>Delete</button>
    </div>
  );
}
```

### 4. Reordering Segments (Drag & Drop)

```typescript
function DraggableSegment({ segment, index }: Props) {
  const { reorderComposition, setDragSrcIdx, dragSrcIdx } = useEditorStore();

  const handleDragStart = (e: React.DragEvent) => {
    setDragSrcIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragSrcIdx !== null && dragSrcIdx !== index) {
      reorderComposition(dragSrcIdx, index);
    }
    setDragSrcIdx(null);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {segment.text}
    </div>
  );
}
```

### 5. Character-Level Editing

```typescript
function CharacterEditor() {
  const {
    isCharEditMode,
    charComposition,
    charLevelData,
    toggleCharEditMode,
    deleteCharAtPosition
  } = useEditorStore();

  if (!isCharEditMode) {
    return <button onClick={toggleCharEditMode}>Enable Char Edit</button>;
  }

  const displayChars = charComposition.map(idx => charLevelData[idx]);

  return (
    <div>
      {displayChars.map((char, idx) => (
        <span
          key={idx}
          onClick={() => deleteCharAtPosition(idx)}
          style={{ cursor: 'pointer' }}
        >
          {char.char}
        </span>
      ))}
      <button onClick={toggleCharEditMode}>Disable Char Edit</button>
    </div>
  );
}
```

### 6. Display Mode Switching

```typescript
function DisplayModeSelector() {
  const { displayMode, setDisplayMode } = useEditorStore();

  return (
    <select
      value={displayMode}
      onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
    >
      <option value="continuous">Continuous</option>
      <option value="line-by-line">Line by Line</option>
      <option value="smart-paragraph">Smart Paragraph</option>
    </select>
  );
}
```

### 7. Smart Paragraphs

```typescript
function SmartParagraphView() {
  const {
    smartParagraphGroups,
    composition,
    lastSegments,
    displayMode
  } = useEditorStore();

  if (displayMode !== 'smart-paragraph') return null;

  return (
    <div>
      {smartParagraphGroups.map((group, paragraphIdx) => (
        <div key={paragraphIdx} className="paragraph">
          {group.map(compIdx => {
            const segmentIdx = composition[compIdx];
            const segment = lastSegments[segmentIdx];
            return <span key={compIdx}>{segment.text}</span>;
          })}
        </div>
      ))}
    </div>
  );
}
```

### 8. Reset Edits

```typescript
function ResetButton() {
  const { hasEdited, resetEdits } = useEditorStore();

  if (!hasEdited) return null;

  return (
    <button onClick={resetEdits}>
      Reset All Edits
    </button>
  );
}
```

### 9. Playback Control

```typescript
function PlaybackControls() {
  const {
    editedPlaying,
    editedPlayPos,
    setEditedPlaying,
    setEditedPlayPos
  } = useEditorStore();

  const handlePlay = () => setEditedPlaying(true);
  const handlePause = () => setEditedPlaying(false);
  const handleSeek = (position: number) => setEditedPlayPos(position);

  return (
    <div>
      <button onClick={editedPlaying ? handlePause : handlePlay}>
        {editedPlaying ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        value={editedPlayPos}
        onChange={(e) => handleSeek(Number(e.target.value))}
      />
    </div>
  );
}
```

## ASR Operations

### 1. File Selection

```typescript
function FileUpload() {
  const { setCurrentFile, setAudioUrl } = useASRStore();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCurrentFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    }
  };

  return <input type="file" accept="audio/*" onChange={handleFileChange} />;
}
```

### 2. Material Selection

```typescript
function MaterialSelector({ materials }: { materials: string[] }) {
  const { currentMaterial, setCurrentMaterial, setAudioUrl } = useASRStore();

  const handleSelect = (material: string) => {
    setCurrentMaterial(material);
    setAudioUrl(`/materials/${material}`);
  };

  return (
    <select
      value={currentMaterial || ''}
      onChange={(e) => handleSelect(e.target.value)}
    >
      <option value="">Select Material</option>
      {materials.map(name => (
        <option key={name} value={name}>{name}</option>
      ))}
    </select>
  );
}
```

### 3. Recognition Settings

```typescript
function RecognitionSettings() {
  const {
    recognitionMode,
    hotwords,
    cacheEnabled,
    setRecognitionMode,
    setHotwords,
    toggleCache
  } = useASRStore();

  return (
    <div>
      <div>
        <label>Mode:</label>
        <select
          value={recognitionMode}
          onChange={(e) => setRecognitionMode(e.target.value as 'basic' | 'advanced')}
        >
          <option value="basic">Basic</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div>
        <label>Hotwords:</label>
        <input
          value={hotwords}
          onChange={(e) => setHotwords(e.target.value)}
          placeholder="Enter hotwords..."
        />
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={cacheEnabled}
            onChange={toggleCache}
          />
          Enable Cache
        </label>
      </div>
    </div>
  );
}
```

### 4. Recognition Status

```typescript
function RecognitionStatus() {
  const { isRecognizing, serverStatus } = useASRStore();

  if (!isRecognizing && !serverStatus) return null;

  return (
    <div>
      {isRecognizing && <p>Recognizing...</p>}
      {serverStatus && (
        <p>
          Queue: {serverStatus.waiting} waiting, {serverStatus.processing} processing
        </p>
      )}
    </div>
  );
}
```

### 5. Recognition API Call

```typescript
function useRecognition() {
  const {
    currentFile,
    currentMaterial,
    recognitionMode,
    hotwords,
    cacheEnabled,
    setIsRecognizing,
    setUsedHotwords
  } = useASRStore();
  const setRecognitionResult = useEditorStore(state => state.setRecognitionResult);

  const recognize = async () => {
    if (!currentFile && !currentMaterial) {
      alert('Please select a file or material');
      return;
    }

    setIsRecognizing(true);

    try {
      const formData = new FormData();
      if (currentFile) {
        formData.append('audio', currentFile);
      } else if (currentMaterial) {
        formData.append('material_name', currentMaterial);
      }
      formData.append('enable_advanced', recognitionMode === 'advanced' ? '1' : '0');
      if (hotwords) {
        formData.append('hotwords', hotwords);
      }

      const response = await fetch('/asr', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      setRecognitionResult(result.full_text, result.segments, result.char_level_data);
      setUsedHotwords(hotwords || null);
    } catch (error) {
      console.error('Recognition failed:', error);
    } finally {
      setIsRecognizing(false);
    }
  };

  return { recognize };
}
```

## UI Operations

### 1. Theme Toggle

```typescript
function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore();

  return (
    <button onClick={toggleTheme}>
      {theme === 'dark' ? '🌞 Light Mode' : '🌙 Dark Mode'}
    </button>
  );
}
```

### 2. Materials Modal

```typescript
function MaterialsModal() {
  const { materialsModalOpen, setMaterialsModalOpen } = useUIStore();

  if (!materialsModalOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setMaterialsModalOpen(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Materials Library</h2>
        {/* Material list content */}
        <button onClick={() => setMaterialsModalOpen(false)}>Close</button>
      </div>
    </div>
  );
}

function OpenMaterialsButton() {
  const setMaterialsModalOpen = useUIStore(state => state.setMaterialsModalOpen);
  return <button onClick={() => setMaterialsModalOpen(true)}>Materials</button>;
}
```

### 3. Context Menu

```typescript
function SegmentWithContextMenu({ segment, index }: Props) {
  const { showContextMenu } = useUIStore();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, index);
  };

  return (
    <div onContextMenu={handleContextMenu}>
      {segment.text}
    </div>
  );
}

function ContextMenu() {
  const { contextMenu, hideContextMenu } = useUIStore();
  const deleteAtPosition = useEditorStore(state => state.deleteAtPosition);

  if (!contextMenu) return null;

  const handleDelete = () => {
    deleteAtPosition(contextMenu.targetIndex);
    hideContextMenu();
  };

  return (
    <div
      className="context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button onClick={handleDelete}>Delete</button>
      <button onClick={hideContextMenu}>Cancel</button>
    </div>
  );
}
```

### 4. Debug Panel

```typescript
function DebugPanel() {
  const { debugVisible, toggleDebugVisible } = useUIStore();
  const { composition, lastSegments, hasEdited } = useEditorStore();

  return (
    <div>
      <button onClick={toggleDebugVisible}>
        {debugVisible ? 'Hide' : 'Show'} Debug
      </button>
      {debugVisible && (
        <div className="debug-panel">
          <h3>Debug Info</h3>
          <p>Segments: {lastSegments.length}</p>
          <p>Composition: {composition.length}</p>
          <p>Edited: {hasEdited ? 'Yes' : 'No'}</p>
          <pre>{JSON.stringify(composition, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
```

## Advanced Patterns

### 1. Custom Hook for Computed State

```typescript
function useDisplaySegments() {
  const { composition, lastSegments } = useEditorStore();

  return useMemo(() => {
    return composition.map(idx => lastSegments[idx]);
  }, [composition, lastSegments]);
}

// Usage
function SegmentList() {
  const displaySegments = useDisplaySegments();

  return (
    <div>
      {displaySegments.map((segment, idx) => (
        <div key={idx}>{segment.text}</div>
      ))}
    </div>
  );
}
```

### 2. Selective Re-renders

```typescript
// Only re-render when displayMode changes
function DisplayModeIndicator() {
  const displayMode = useEditorStore(state => state.displayMode);
  return <div>Mode: {displayMode}</div>;
}

// Only re-render when composition length changes
function SegmentCount() {
  const count = useEditorStore(state => state.composition.length);
  return <div>Segments: {count}</div>;
}
```

### 3. Combining Multiple Stores

```typescript
function RecognitionButton() {
  const { currentFile, currentMaterial, isRecognizing } = useASRStore();
  const hasContent = useEditorStore(state => state.lastSegments.length > 0);
  const { recognize } = useRecognition();

  const canRecognize = (currentFile || currentMaterial) && !isRecognizing;

  return (
    <div>
      <button onClick={recognize} disabled={!canRecognize}>
        {isRecognizing ? 'Recognizing...' : 'Start Recognition'}
      </button>
      {hasContent && <span>✓ Results available</span>}
    </div>
  );
}
```

### 4. Store Subscriptions (Outside React)

```typescript
// Subscribe to store changes outside of components
const unsubscribe = useEditorStore.subscribe(
  (state) => state.hasEdited,
  (hasEdited) => {
    console.log('Editor edited status changed:', hasEdited);
    // Could trigger auto-save, show warning, etc.
  }
);

// Cleanup
unsubscribe();
```

### 5. Accessing Store Outside Components

```typescript
// Get current state
const currentState = useEditorStore.getState();
console.log('Current segments:', currentState.lastSegments);

// Call actions
useEditorStore.getState().resetEdits();
```

### 6. Batch Updates for Performance

```typescript
function bulkDeleteSegments(indices: number[]) {
  const { composition, updateComposition } = useEditorStore.getState();

  // Filter out multiple indices at once
  const newComposition = composition.filter((_, idx) => !indices.includes(idx));

  // Single update instead of multiple
  updateComposition(newComposition);
}
```

### 7. Undo/Redo Pattern

```typescript
function useUndo() {
  const [history, setHistory] = useState<number[][]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const composition = useEditorStore(state => state.composition);
  const updateComposition = useEditorStore(state => state.updateComposition);

  // Save state to history
  const saveState = useCallback(() => {
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push([...composition]);
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
  }, [composition, history, currentIndex]);

  // Undo
  const undo = useCallback(() => {
    if (currentIndex > 0) {
      const previousState = history[currentIndex - 1];
      updateComposition(previousState);
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex, history, updateComposition]);

  // Redo
  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      const nextState = history[currentIndex + 1];
      updateComposition(nextState);
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, history, updateComposition]);

  return { saveState, undo, redo, canUndo: currentIndex > 0, canRedo: currentIndex < history.length - 1 };
}
```

### 8. Real-time Sync with Audio Playback

```typescript
function useAudioSync(audioRef: RefObject<HTMLAudioElement>) {
  const { composition, lastSegments } = useEditorStore();
  const setEditedPlayPos = useEditorStore(state => state.setEditedPlayPos);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime * 1000; // Convert to ms
      setEditedPlayPos(currentTime);

      // Highlight current segment
      const currentSegmentIdx = composition.findIndex(idx => {
        const segment = lastSegments[idx];
        return currentTime >= segment.start && currentTime <= segment.end;
      });

      // Could update UI to show current segment
      console.log('Current segment:', currentSegmentIdx);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [audioRef, composition, lastSegments, setEditedPlayPos]);
}
```

## Performance Tips

### 1. Use Selectors for Specific Values

```typescript
// ❌ Bad - Re-renders on any store change
const store = useEditorStore();

// ✅ Good - Only re-renders when displayMode changes
const displayMode = useEditorStore(state => state.displayMode);
```

### 2. Memoize Derived State

```typescript
// ✅ Good - Memoize expensive computations
const displaySegments = useMemo(() => {
  return composition.map(idx => lastSegments[idx]);
}, [composition, lastSegments]);
```

### 3. Split Large Components

```typescript
// ✅ Good - Each segment subscribes only to what it needs
function SegmentList() {
  const composition = useEditorStore(state => state.composition);

  return (
    <div>
      {composition.map(idx => (
        <Segment key={idx} index={idx} />
      ))}
    </div>
  );
}

function Segment({ index }: { index: number }) {
  const segment = useEditorStore(state => state.lastSegments[state.composition[index]]);
  return <div>{segment.text}</div>;
}
```
