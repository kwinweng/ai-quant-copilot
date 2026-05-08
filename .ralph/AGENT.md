# Ralph Agent Configuration

## Build Instructions

```bash
npm run build
```

## Test Instructions

```bash
npm run lint
npm run build
```

## Run Instructions

```bash
npm run dev
```

## Notes

- Project root is the Next.js app root (package.json lives here)
- Use App Router (`src/app/` directory)
- shadcn/ui components go in `src/components/ui/`
- Mock data goes in `src/data/`
- Recharts must be imported as client components (`"use client"`)
- Run `npm run build` after every page to catch TypeScript errors early
