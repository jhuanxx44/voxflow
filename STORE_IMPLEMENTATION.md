# Zustand Store Implementation

This document describes the Zustand stores created for the FunASR Audio Editor React refactoring.

## Overview

Three Zustand stores have been created to manage the application state:

1. **editorStore** - Main editor state and editing operations
2. **asrStore** - ASR recognition state and settings
3. **uiStore** - UI state including theme, modals, and visibility

## File Structure

```
src/
├── types/
│   ├── index.ts        # Central export for all types
│   ├── asr.ts          # ASR-related types (existing)
│   ├── editor.ts       # Editor-related types (existing)
│   ├── chat.ts         # Chat-related types (existing)
│   └── ui.ts           # UI-related types (NEW)
└── stores/
    ├── index.ts        # Central export for all stores (NEW)
    ├── editorStore.ts  # Editor state management (NEW)
    ├── asrStore.ts     # ASR state management (NEW)
    └── uiStore.ts      # UI state management (NEW)
```

## Store Details

### 1. editorStore.ts

**Purpose**: Manages the main editor state including recognition results, composition arrays, display modes, and editing operations.

**Key State**:
- `lastFullText` - Complete recognized text
- `lastSegments` - Original ASR segments
- `charLevelData` - Character-level data for char edit mode
- `composition` - Array of segment indices (after reordering/deletion)
- `charComposition` - Array of character indices (for char edit mode)
- `smartParagraphGroups` - Paragraph groupings
- `isCharEditMode` - Whether character-level editing is enabled
- `displayMode` - Current display mode (continuous/line-by-line/smart-paragraph)
- `hasEdited` - Whether any edits have been made
- `editedPlaying` - Whether edited version is playing
- `editedPlayPos` - Current playback position

**Key Actions**:
- `setRecognitionResult()` - Set new recognition results
- `deleteAtPosition()` - Delete segment at index
- `deleteCharAtPosition()` - Delete character at index
- `reorderComposition()` - Reorder segments via drag & drop
- `setDisplayMode()` - Change display mode
- `toggleCharEditMode()` - Toggle character-level editing
- `resetEdits()` - Reset all edits to original state
- `setSmartParagraphGroups()` - Update paragraph groupings

**Features**:
- Uses `immer` middleware for immutable updates
- Persists `displayMode` to localStorage
- Automatically marks as edited when composition changes

### 2. asrStore.ts

**Purpose**: Manages ASR recognition state including file/material selection, recognition settings, and server status.

**Key State**:
- `currentFile` - Currently selected audio file
- `currentMaterial` - Currently selected material name
- `audioUrl` - URL for audio playback
- `isRecognizing` - Whether recognition is in progress
- `recognitionMode` - 'basic' or 'advanced'
- `hotwords` - User-entered hotwords
- `usedHotwords` - Hotwords used in last recognition
- `serverStatus` - Server queue status (waiting/processing)
- `cacheEnabled` - Whether caching is enabled

**Key Actions**:
- `setCurrentFile()` - Set current audio file (clears material)
- `setCurrentMaterial()` - Set current material (clears file)
- `setAudioUrl()` - Set audio URL for playback
- `setIsRecognizing()` - Update recognition status
- `setRecognitionMode()` - Switch between basic/advanced
- `setHotwords()` - Update hotwords
- `setServerStatus()` - Update server queue status
- `toggleCache()` - Toggle cache on/off
- `clearCurrentAudio()` - Clear all audio state

**Features**:
- Mutually exclusive file/material selection
- Uses `immer` middleware for immutable updates

### 3. uiStore.ts

**Purpose**: Manages UI state including theme, modals, context menu, and visibility settings.

**Key State**:
- `theme` - Current theme ('dark' or 'light')
- `materialsModalOpen` - Materials library modal state
- `adminModalOpen` - Admin modal state
- `contextMenu` - Context menu state (position, target)
- `segmentsVisible` - Whether segments panel is visible
- `debugVisible` - Whether debug panel is visible

**Key Actions**:
- `toggleTheme()` - Toggle between dark/light theme
- `setTheme()` - Set specific theme
- `setMaterialsModalOpen()` - Open/close materials modal
- `setAdminModalOpen()` - Open/close admin modal
- `showContextMenu()` - Show context menu at position
- `hideContextMenu()` - Hide context menu
- `toggleSegmentsVisible()` - Toggle segments panel
- `toggleDebugVisible()` - Toggle debug panel

**Features**:
- Persists theme to localStorage
- Automatically updates body class for theme changes
- Initializes theme on module load
- Uses `immer` middleware for immutable updates

## Usage Examples

### Using the Editor Store

```typescript
import { useEditorStore } from '@/stores';

function EditorComponent() {
  const {
    composition,
    lastSegments,
    displayMode,
    deleteAtPosition,
    setDisplayMode
  } = useEditorStore();

  // Get current segments in display order
  const displaySegments = composition.map(i => lastSegments[i]);

  return (
    <div>
      {displaySegments.map((segment, idx) => (
        <div key={idx}>
          {segment.text}
          <button onClick={() => deleteAtPosition(idx)}>Delete</button>
        </div>
      ))}
      <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value)}>
        <option value="continuous">Continuous</option>
        <option value="line-by-line">Line by Line</option>
        <option value="smart-paragraph">Smart Paragraph</option>
      </select>
    </div>
  );
}
```

### Using the ASR Store

```typescript
import { useASRStore } from '@/stores';

function RecognitionPanel() {
  const {
    isRecognizing,
    recognitionMode,
    hotwords,
    setRecognitionMode,
    setHotwords
  } = useASRStore();

  return (
    <div>
      <select
        value={recognitionMode}
        onChange={(e) => setRecognitionMode(e.target.value)}
        disabled={isRecognizing}
      >
        <option value="basic">Basic</option>
        <option value="advanced">Advanced</option>
      </select>
      <input
        value={hotwords}
        onChange={(e) => setHotwords(e.target.value)}
        placeholder="Enter hotwords..."
      />
    </div>
  );
}
```

### Using the UI Store

```typescript
import { useUIStore } from '@/stores';

function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore();

  return (
    <button onClick={toggleTheme}>
      {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
    </button>
  );
}

function MaterialsButton() {
  const { setMaterialsModalOpen } = useUIStore();

  return (
    <button onClick={() => setMaterialsModalOpen(true)}>
      Open Materials
    </button>
  );
}
```

## Integration Notes

1. **Import from central location**:
   ```typescript
   import { useEditorStore, useASRStore, useUIStore } from '@/stores';
   ```

2. **Types are available from stores**:
   ```typescript
   import type { DisplayMode, Theme } from '@/types';
   ```

3. **Stores use immer middleware** - You can write "mutating" code in actions, it will be automatically made immutable.

4. **LocalStorage persistence**:
   - `displayMode` is persisted (editorStore)
   - `theme` is persisted (uiStore)

5. **Theme initialization** - The uiStore automatically applies the saved theme class to document.body on load.

## Migration from Original Implementation

### State Variable Mapping

Original (index.html) → New Store:

**Editor State**:
- `lastFullText` → `editorStore.lastFullText`
- `lastSegments` → `editorStore.lastSegments`
- `composition` → `editorStore.composition`
- `charComposition` → `editorStore.charComposition`
- `charLevelData` → `editorStore.charLevelData`
- `isCharEditMode` → `editorStore.isCharEditMode`
- `hasEdited` → `editorStore.hasEdited`
- `editedPlaying` → `editorStore.editedPlaying`
- `editedPlayPos` → `editorStore.editedPlayPos`
- `smartParagraphGroups` → `editorStore.smartParagraphGroups`

**ASR State**:
- `currentFileUrl` → `asrStore.audioUrl`
- `currentMaterialName` → `asrStore.currentMaterial`
- `isRecognizing` (implied) → `asrStore.isRecognizing`
- `hotwords` → `asrStore.hotwords`
- `usedHotwords` → `asrStore.usedHotwords`

**UI State**:
- Theme (localStorage) → `uiStore.theme`
- Modal visibility → `uiStore.materialsModalOpen`, `uiStore.adminModalOpen`
- Context menu → `uiStore.contextMenu`

## Dependencies

Required packages (already in package.json):
- `zustand`: ^5.0.9
- `immer`: (peer dependency of zustand middleware)

## Next Steps

To complete the refactoring:

1. Create React components that use these stores
2. Migrate the editing logic from index.html to component event handlers
3. Create custom hooks for complex operations (e.g., `useSmartParagraphs`)
4. Implement the API service layer that updates these stores
5. Add persistence for other state if needed (consider zustand persist middleware)
