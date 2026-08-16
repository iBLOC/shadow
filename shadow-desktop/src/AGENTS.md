# src/ - Frontend (TypeScript/React)

## OVERVIEW

React 19 frontend with TypeScript. Vite build.

## STRUCTURE

```
src/
├── App.tsx          # Root component
├── main.tsx        # Entry point
├── App.css         # Global styles (19KB - large)
├── components/     # Reusable UI components
├── hooks/         # Custom React hooks
├── pages/         # Route pages
├── stores/        # Zustand state stores
├── lib/           # Utilities
├── types/         # TypeScript definitions
└── i18n/          # Internationalization
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Root Component | `App.tsx` |
| Entry Point | `main.tsx` |
| State | `stores/` |
| Components | `components/` |
| Pages | `pages/` |

## CONVENTIONS

- React 19 with TypeScript
- Zustand for state
- React Router 7 for routing
- i18next for i18n
- Zod for validation

## ANTI-PATTERNS

- App.css is 19KB - should be split by component
