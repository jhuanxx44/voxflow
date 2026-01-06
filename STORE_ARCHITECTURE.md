# Store Architecture Overview

## Store Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application State                         │
└─────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼────────┐    ┌────────▼────────┐    ┌──────▼──────┐
│  editorStore   │    │    asrStore     │    │   uiStore   │
└────────────────┘    └─────────────────┘    └─────────────┘
```

## Store Responsibilities

### editorStore (Main Editor Logic)
```
┌────────────────────────────────────────────────────┐
│              editorStore                           │
├────────────────────────────────────────────────────┤
│ Recognition Results                                │
│  • lastFullText                                    │
│  • lastSegments[]                                  │
│  • charLevelData[]                                 │
├────────────────────────────────────────────────────┤
│ Composition (Critical for Editing)                 │
│  • composition[]        (segment indices)          │
│  • charComposition[]    (character indices)        │
│  • smartParagraphGroups[][] (paragraph groupings)  │
├────────────────────────────────────────────────────┤
│ Display & Edit Modes                               │
│  • displayMode          (continuous/line/smart)    │
│  • isCharEditMode       (char-level editing)       │
│  • hasEdited            (edit tracking)            │
├────────────────────────────────────────────────────┤
│ Playback State                                     │
│  • editedPlaying                                   │
│  • editedPlayPos                                   │
├────────────────────────────────────────────────────┤
│ Actions                                            │
│  • setRecognitionResult()                          │
│  • deleteAtPosition()                              │
│  • reorderComposition()                            │
│  • resetEdits()                                    │
│  • toggleCharEditMode()                            │
└────────────────────────────────────────────────────┘
```

### asrStore (Recognition Management)
```
┌────────────────────────────────────────────────────┐
│              asrStore                              │
├────────────────────────────────────────────────────┤
│ Audio Source                                       │
│  • currentFile          (File | null)              │
│  • currentMaterial      (string | null)            │
│  • audioUrl             (for playback)             │
├────────────────────────────────────────────────────┤
│ Recognition Settings                               │
│  • isRecognizing        (status)                   │
│  • recognitionMode      (basic/advanced)           │
│  • hotwords             (user input)               │
│  • usedHotwords         (last used)                │
├────────────────────────────────────────────────────┤
│ Server State                                       │
│  • serverStatus         { waiting, processing }    │
│  • cacheEnabled                                    │
├────────────────────────────────────────────────────┤
│ Actions                                            │
│  • setCurrentFile()                                │
│  • setCurrentMaterial()                            │
│  • setRecognitionMode()                            │
│  • setHotwords()                                   │
│  • clearCurrentAudio()                             │
└────────────────────────────────────────────────────┘
```

### uiStore (UI State)
```
┌────────────────────────────────────────────────────┐
│              uiStore                               │
├────────────────────────────────────────────────────┤
│ Theme                                              │
│  • theme                (dark/light)               │
├────────────────────────────────────────────────────┤
│ Modals                                             │
│  • materialsModalOpen                              │
│  • adminModalOpen                                  │
├────────────────────────────────────────────────────┤
│ Context Menu                                       │
│  • contextMenu          { x, y, targetIndex }      │
├────────────────────────────────────────────────────┤
│ Visibility                                         │
│  • segmentsVisible                                 │
│  • debugVisible                                    │
├────────────────────────────────────────────────────┤
│ Actions                                            │
│  • toggleTheme()                                   │
│  • setMaterialsModalOpen()                         │
│  • showContextMenu()                               │
│  • hideContextMenu()                               │
└────────────────────────────────────────────────────┘
```

## Data Flow

### Recognition Flow
```
User Action → asrStore → API Call → editorStore
                │                       │
                ├─ setIsRecognizing()   ├─ setRecognitionResult()
                ├─ setUsedHotwords()    ├─ Reset composition arrays
                └─ setAudioUrl()        └─ Clear edit state
```

### Editing Flow
```
User Edit → editorStore
              │
              ├─ deleteAtPosition()    → Update composition[]
              ├─ reorderComposition()  → Reorder composition[]
              └─ Set hasEdited = true
```

### Theme Flow
```
User Toggle → uiStore.toggleTheme()
                 │
                 ├─ Update state.theme
                 ├─ Save to localStorage
                 └─ Update body.className
```

## State Persistence

```
┌──────────────────┐
│   localStorage   │
├──────────────────┤
│ • theme          │ ← uiStore
│ • displayMode    │ ← editorStore
└──────────────────┘
```

## Component Access Pattern

### Single Store
```typescript
function MyComponent() {
  const displayMode = useEditorStore(state => state.displayMode);
  const setDisplayMode = useEditorStore(state => state.setDisplayMode);

  // Use state and actions...
}
```

### Multiple Stores
```typescript
function MyComponent() {
  const { composition, lastSegments } = useEditorStore();
  const { isRecognizing } = useASRStore();
  const { theme } = useUIStore();

  // Use state from multiple stores...
}
```

### Derived State
```typescript
function MyComponent() {
  const { composition, lastSegments } = useEditorStore();

  // Derive display segments
  const displaySegments = composition.map(i => lastSegments[i]);

  return (
    <div>
      {displaySegments.map(segment => (
        <div key={segment.start}>{segment.text}</div>
      ))}
    </div>
  );
}
```

## Key Design Decisions

### 1. Separation of Concerns
- **editorStore**: Editing logic and content
- **asrStore**: Recognition settings and status
- **uiStore**: Pure UI state (no business logic)

### 2. Composition Arrays
The `composition` and `charComposition` arrays are critical:
- Store **indices** not actual data
- Enable non-destructive editing
- Allow easy reordering and deletion
- Preserve original data in `lastSegments` and `charLevelData`

### 3. Immer Middleware
All stores use `immer` middleware:
- Write "mutating" code that's actually immutable
- Simpler update logic
- Better performance for nested updates

### 4. LocalStorage Integration
- `displayMode` persisted for UX continuity
- `theme` persisted for user preference
- Other state is session-based

### 5. Mutual Exclusivity
In `asrStore`, file and material are mutually exclusive:
```typescript
setCurrentFile: (file) => {
  state.currentFile = file;
  if (file) state.currentMaterial = null; // Clear material
}
```

## Testing Strategy

### Unit Testing Stores
```typescript
import { useEditorStore } from '@/stores';

describe('editorStore', () => {
  beforeEach(() => {
    // Reset store state
    useEditorStore.setState({
      composition: [],
      lastSegments: [],
      hasEdited: false,
    });
  });

  it('should delete segment at position', () => {
    const store = useEditorStore.getState();
    store.setRecognitionResult('text', mockSegments);
    store.deleteAtPosition(0);

    expect(store.composition).toHaveLength(mockSegments.length - 1);
    expect(store.hasEdited).toBe(true);
  });
});
```

### Integration Testing
```typescript
import { renderHook, act } from '@testing-library/react';
import { useEditorStore, useASRStore } from '@/stores';

it('should update editor when recognition completes', () => {
  const { result: asrResult } = renderHook(() => useASRStore());
  const { result: editorResult } = renderHook(() => useEditorStore());

  act(() => {
    asrResult.current.setIsRecognizing(true);
  });

  // Simulate recognition complete
  act(() => {
    editorResult.current.setRecognitionResult('text', mockSegments);
    asrResult.current.setIsRecognizing(false);
  });

  expect(editorResult.current.lastSegments).toEqual(mockSegments);
  expect(asrResult.current.isRecognizing).toBe(false);
});
```
