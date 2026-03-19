# Svelte 5 Migration Design

## Overview

Migrate the creevey-reporter UI from React to Svelte 5 with runes, keeping Bun.serve as the API server.

## Goals

- Improve developer experience through Svelte's simpler reactivity model
- Leverage Svelte 5 runes (`$state`, `$derived`, `$effect`) for fine-grained reactivity
- Minimize dependencies by using Bun's native capabilities

## Stack

| Layer        | Technology                |
| ------------ | ------------------------- |
| UI Framework | Svelte 5                  |
| Server       | Bun.serve (unchanged)     |
| Styling      | Plain CSS (port existing) |
| Language     | TypeScript                |

## File Structure

```
src/
├── client/
│   ├── App.svelte           # Main app component
│   ├── Sidebar.svelte       # Test tree sidebar
│   ├── ImageViewer.svelte    # Image comparison view
│   └── styles.css            # CSS styles (port as-is)
├── server.ts                # Bun API server (unchanged)
├── types.ts                 # TypeScript types (unchanged)
└── index.ts                 # Svelte mount entry point
```

## Component Mapping

| React Component          | Svelte 5 Component |
| ------------------------ | ------------------ |
| App.tsx                  | App.svelte         |
| Sidebar.tsx (inline)     | Sidebar.svelte     |
| ImageViewer.tsx (inline) | ImageViewer.svelte |

## State Management

Replace React hooks with Svelte 5 runes:

| React                              | Svelte 5                                    |
| ---------------------------------- | ------------------------------------------- |
| `useState<T>(initial)`             | `let value = $state<T>(initial)`            |
| `useEffect(() => {...})`           | `$effect(() => {...})`                      |
| `useMemo(() => compute(), [deps])` | `$derived(expr)`                            |
| `useCallback(fn, [deps])`          | Regular function or `$derived.by(() => fn)` |
| `createContext`                    | Svelte context or `$context`                |

## Key Svelte 5 Patterns

### Props

```svelte
<script lang="ts">
  interface Props {
    initialState: InitialState;
    onApprove: (id: string, retry: number, image: string) => void;
  }
  let { initialState, onApprove }: Props = $props();
</script>
```

### Reactive State

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('count changed:', count);
  });
</script>
```

### Event Handlers

```svelte
<button onclick={() => handleClick()}>Click</button>
```

## Migration Steps

1. Install Svelte 5: `bun add svelte`
2. Rename `index.tsx` to `index.ts`, update to mount Svelte
3. Convert `client/App.tsx` → `client/App.svelte`
4. Convert inline sidebar to `client/Sidebar.svelte`
5. Convert inline ImageViewer to `client/ImageViewer.svelte`
6. Port CSS from `client/styles.css` (should work as-is)
7. Run typecheck, lint, verify

## API Endpoints (Unchanged)

| Endpoint             | Method | Description          |
| -------------------- | ------ | -------------------- |
| `/api/report`        | GET    | Get test report data |
| `/api/approve`       | POST   | Approve single image |
| `/api/approve-all`   | POST   | Approve all images   |
| `/api/images/:path*` | GET    | Serve image files    |

## Risks & Mitigations

| Risk                          | Mitigation                                                    |
| ----------------------------- | ------------------------------------------------------------- |
| Svelte 5 runes learning curve | Use incremental debugging, test each component                |
| Bun.serve compatibility       | Bun has native Svelte support via bundling                    |
| CSS scoping differences       | Svelte scopes styles by default; use `:global()` where needed |

## Success Criteria

- [ ] All React dependencies removed
- [ ] Svelte 5 runes used for all state management
- [ ] Bun dev server runs with HMR
- [ ] TypeScript passes typecheck
- [ ] oxlint reports no errors
- [ ] UI renders and functions identically
