# Commands For Next 3 Phases Roadmap

## Copy Roadmap Files Into Project

Run from the AI Quant Copilot project root:

```bash
mkdir -p docs/claude/roadmap

cp "/Users/kwin/Documents/Codex/2026-05-08/files-mentioned-by-the-user-clippings/docs/claude/roadmap/NEXT_3_PHASES_ROADMAP.md" docs/claude/roadmap/
cp "/Users/kwin/Documents/Codex/2026-05-08/files-mentioned-by-the-user-clippings/docs/claude/roadmap/RALPH_FIX_PLAN_NEXT_3_PHASES.md" docs/claude/roadmap/
cp "/Users/kwin/Documents/Codex/2026-05-08/files-mentioned-by-the-user-clippings/docs/claude/roadmap/CLAUDE_MASTER_PROMPT_NEXT_3_PHASES.md" docs/claude/roadmap/
cp "/Users/kwin/Documents/Codex/2026-05-08/files-mentioned-by-the-user-clippings/docs/claude/roadmap/HANDOFF_MESSAGE.md" docs/claude/roadmap/
```

Commit:

```bash
git add docs/claude/roadmap
git commit -m "docs: add next three phase roadmap"
```

## If Using Ralph

```bash
cp docs/claude/roadmap/RALPH_FIX_PLAN_NEXT_3_PHASES.md .ralph/fix_plan.md
cp docs/claude/roadmap/CLAUDE_MASTER_PROMPT_NEXT_3_PHASES.md .ralph/PROMPT.md

ralph --monitor --live
```

## If Using Claude Directly

```bash
claude
```

Paste:

```bash
cat docs/claude/roadmap/HANDOFF_MESSAGE.md
```

Then paste:

```bash
cat docs/claude/roadmap/CLAUDE_MASTER_PROMPT_NEXT_3_PHASES.md
```

## Review After Each Phase

```bash
git status
git diff
npm run build
```

If available:

```bash
npm run lint
```

