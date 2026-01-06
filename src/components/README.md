# React Components Documentation

This directory contains all React + TypeScript + Tailwind CSS components for the FunASR Audio Editor.

## Component Structure

```
components/
├── layout/          # Layout components
│   ├── MainLayout.tsx    # Two-column main layout
│   ├── Header.tsx        # App header with theme toggle
│   ├── Card.tsx          # Reusable card container
│   └── index.ts          # Exports
├── common/          # Common UI components
│   ├── Button.tsx        # Reusable button
│   ├── Modal.tsx         # Modal dialog
│   ├── ContextMenu.tsx   # Right-click context menu
│   ├── LoadingSpinner.tsx # Loading animation
│   └── index.ts          # Exports
├── audio/           # Audio-related components (TBD)
├── chat/            # Chat panel components (TBD)
├── modals/          # Modal dialogs (TBD)
└── result/          # Result display components (TBD)
```

## Usage Examples

### MainLayout

```tsx
import { MainLayout, Header } from '@/components/layout';
import { ChatPanel } from '@/components/chat';

function App() {
  return (
    <>
      <Header />
      <MainLayout chatPanel={<ChatPanel />}>
        {/* Your main content here */}
      </MainLayout>
    </>
  );
}
```

### Header

```tsx
import { Header } from '@/components/layout';

// Simple usage - includes title and theme toggle
<Header />
```

### Card

```tsx
import { Card } from '@/components/layout';

// Basic card
<Card title="识别全文">
  <p>Your content here</p>
</Card>

// Collapsible card
<Card
  title="分段结果"
  collapsible
  defaultCollapsed={false}
  onToggle={(collapsed) => console.log('Collapsed:', collapsed)}
>
  <p>Your content here</p>
</Card>

// Card with extra header content
<Card
  title="调试信息"
  headerExtra={
    <button onClick={handleAction}>操作</button>
  }
>
  <p>Your content here</p>
</Card>
```

### Button

```tsx
import { Button } from '@/components/common';

// Primary button (with gradient and glow)
<Button variant="primary" onClick={handleClick}>
  开始识别
</Button>

// Secondary button (default)
<Button onClick={handleClick}>
  清空
</Button>

// Danger button
<Button variant="danger" onClick={handleDelete}>
  删除
</Button>

// With loading state
<Button loading={isLoading} disabled={isLoading}>
  处理中...
</Button>

// Different sizes
<Button size="sm">小按钮</Button>
<Button size="md">中按钮</Button>
<Button size="lg">大按钮</Button>
```

### Modal

```tsx
import { Modal } from '@/components/common';
import { useState } from 'react';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>打开</button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="素材库"
        size="md"
      >
        <p>Modal content here</p>
      </Modal>
    </>
  );
}
```

### ContextMenu

```tsx
import { ContextMenu, ContextMenuItem } from '@/components/common';
import { useState } from 'react';

function MyComponent() {
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const menuItems: ContextMenuItem[] = [
    {
      label: '编辑',
      onClick: () => console.log('Edit'),
    },
    {
      label: '删除',
      onClick: () => console.log('Delete'),
      danger: true,
    },
  ];

  return (
    <>
      <div onContextMenu={handleContextMenu}>
        Right-click me
      </div>

      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={menuItems}
        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
      />
    </>
  );
}
```

### LoadingSpinner

```tsx
import { LoadingSpinner } from '@/components/common';

// Simple spinner
<LoadingSpinner />

// With text
<LoadingSpinner text="识别中" />

// Without dots
<LoadingSpinner text="加载中" showDots={false} />

// Different sizes
<LoadingSpinner size="sm" />
<LoadingSpinner size="md" />
<LoadingSpinner size="lg" />
```

### useTheme Hook

```tsx
import { useTheme } from '@/hooks';

function MyComponent() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div>
      <p>Current theme: {theme}</p>
      <button onClick={toggleTheme}>
        Toggle to {theme === 'dark' ? 'light' : 'dark'} mode
      </button>
    </div>
  );
}
```

## Theme System

All components use CSS variables defined in `/src/index.css`:

**Dark Theme (default):**
- `--bg-body`: #0f1216
- `--bg-card`: #171a21
- `--bg-button`: #1e2430
- `--text-primary`: #e6e6e6
- `--highlight-color`: #2a5a9c
- etc.

**Light Theme:**
- Applied by adding `.light` class to `<html>` element
- Overrides all CSS variables with light theme colors

## Key Features

1. **Type Safety**: All components are fully typed with TypeScript
2. **Theme Support**: Automatic dark/light theme switching via CSS variables
3. **Tailwind CSS**: Uses Tailwind utilities with CSS variable integration
4. **Accessibility**: Proper ARIA labels, keyboard navigation (ESC, Enter)
5. **Animations**: Smooth transitions, rainbow spinner, pulse effects
6. **Responsive**: Mobile-friendly layouts (where applicable)

## Styling Convention

- Use Tailwind utilities for layout and spacing
- Use CSS variables for colors: `bg-[var(--bg-card)]`
- Keep transition duration at 300ms: `transition-all duration-300`
- Border radius: `rounded-lg` (12px) or `rounded-xl` (16px)
