# AGENTS.md — PharmaTrack Pro

Instructions for any coding agent or model working in this repository.

**Before doing anything, read these two files in full, in this order:**

1. [`docs/GLOBAL_CLAUDE_RULES.md`](docs/GLOBAL_CLAUDE_RULES.md) — the working
   method and quality bar that apply to every task (map, read in full, trace
   the flow, verify by running, then edit and report honestly).
2. [`CLAUDE.md`](CLAUDE.md) — everything specific to this project: what it is,
   folder map, commands, coding rules, design rules, known pitfalls, and the
   checklist to run before saying a task is done.

Then, on every prompt: read the files you will change and their callers and
tests first, implement the whole request, run `npm run lint`, `npm test` and
`npm run build`, and report the real results.

`CLAUDE.md` is the single source of truth. Do not duplicate its rules here;
update that file when a rule changes.
