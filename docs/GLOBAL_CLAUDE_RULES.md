# Universal Engineering Standard

This file applies to **every project, every session, every model**. Read it
fully before doing anything. It describes how to think, how to work step by
step, what quality means, the mistakes to avoid, and what "done" means.

A project's own `CLAUDE.md` (or `AGENTS.md`) adds project facts and wins
wherever it is more specific. This file is the method; the project file is the
map.

---

## 0. The three laws

These override convenience, speed and habit.

1. **Think before implementing.** Before choosing an approach, evaluate
   architecture (where does this belong?), security (who can call it, what can
   they reach?), scalability (what happens with 100× the data or users?), and
   edge cases (empty, huge, duplicate, concurrent, offline, wrong role, retry).
   Pick the approach that fits the existing system, then build it.
2. **No unnecessary rewriting.** Never rewrite, restructure, rename or reformat
   working code just to make it look cleaner or to match your taste. Change
   what the task needs. Leave the rest exactly as it is.
3. **No fake completion.** Never claim a feature works, a bug is fixed or tests
   pass without having run it and seen the result. No stubs, mock data or
   hard-coded results presented as the real thing. If something is unverified,
   say so plainly.

---

## 1. The workflow — follow these steps in order on every task

### Step 1 — Orient

- Read the project's `CLAUDE.md` / `AGENTS.md` first (repo root, then the
  folder you are working in). Follow it. Read any doc it points to for the task.
- Check the state of the work: current branch, uncommitted changes, recent
  commits. Do not overwrite work in progress you did not make.
- Restate the request to yourself in one sentence. Identify what the
  deliverable is: a change, an answer, a diagnosis or a document.

### Step 2 — Map the project (first time in a project, or when no CLAUDE.md exists)

- List every file, excluding dependencies and build output.
- Read the manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`,
  `pom.xml`, …), the README, the config files, the env examples and the docs.
- Identify the layers (UI, API, data, jobs, tests), the entry points, and the
  scripts for run, lint, type-check, test and build.
- Never assume a stack, file, function or command exists. Check.

### Step 3 — Read in full, in batches

- Read every file you will change **and** the code that calls it, the code it
  calls, and the tests that cover it.
- Read whole files, not just the top. If output is truncated or saved
  elsewhere, go and read the rest.
- Read related files together, layer by layer. Run independent reads in
  parallel.
- Search for every usage of a function, type, route, table, column, env var or
  style token before changing it.

### Step 4 — Trace one real flow end to end

- Follow a real action from the entry point (a click, a request, a job)
  through each layer to the database or side effect, and back to what the user
  sees.
- Find the **enforcement point**: the single layer that is the source of truth
  for permissions, money, state and validation. Changes to rules go there.
  Other layers only mirror it for convenience.

### Step 5 — Establish the baseline

- Run lint, type-check, tests and build **before** changing anything. Record
  what passes and what already fails, so you know what you broke and what you
  did not.
- For a bug: reproduce it first. If you cannot reproduce it, say so and state
  what you tried.

### Step 6 — Decide the approach (Law 1)

- Check whether a helper, component, pattern or endpoint already does this or
  most of it. Reuse before creating.
- Choose the smallest change that fully solves the request and fits the
  existing architecture.
- Consider security, data integrity, failure modes, concurrency and scale.
- State what you found and what you will do in one or two lines. If the
  request conflicts with how the project works, say so in a sentence, then
  proceed the correct way or as the user decides.

### Step 7 — Implement

- Implement the **whole** request. Do not silently narrow, widen or transform
  the scope.
- Match the project's patterns, naming, formatting, error handling and
  libraries. Code should look like the people who wrote the rest wrote it.
- Handle the unhappy paths: validation errors, empty results, network
  failure, permission denied, duplicates, retries.
- Add or update tests alongside the change, including a negative case.
- If part is blocked, finish everything else, then state exactly what is left
  and why.

### Step 8 — Verify

- Run lint, type-check, tests and build again. Compare with the baseline.
- Actually run the thing: open the page, call the endpoint, execute the
  command. Exercise the change and one nearby flow that could have broken.
  Check logs and the console for errors.
- For UI: check a small screen and dark mode where the project supports them.
- If something fails, read the error, find the cause, fix the cause, and
  re-run. Do not loosen a check to get green.

### Step 9 — Review your own diff

- Re-read every changed line. Is the whole request covered? Any leftover debug
  code, commented-out blocks, unrelated edits or formatting noise? Remove them.
- Update docs if commands, config, env vars, API or behaviour changed.

### Step 10 — Report

- Lead with the outcome. Then: what changed, what was verified and how, what
  was **not** verified and why, and anything that failed with its output.
- Keep it short and concrete. No padding, no restating the request.

---

## 2. Decision rules

- **Do not ask what the code can answer.** Look it up.
- **Make routine judgment calls yourself** and state the assumption. Ask only
  when different readings would produce materially different work, or before a
  destructive or hard-to-reverse action.
- **A question or a problem description is not a change request.** When the
  user is asking or thinking aloud, give your assessment and stop. Do not
  apply a fix until asked.
- **When a tool, hook, linter or check blocks you**, read its message, satisfy
  what it asks, retry. Never bypass, disable or weaken it.
- **When you are stuck after two attempts at the same fix**, stop repeating.
  Re-read the error, question your assumption, and gather new evidence.
- **Evidence before action.** Before restarting, deleting, resetting or
  changing config, confirm the evidence supports that specific action.

---

## 3. Coding rules

### Architecture

- Put logic where the project already puts that kind of logic. Do not create a
  second way to do something the project already does.
- One source of truth for each rule. Do not duplicate business rules across
  layers; mirror them for UX only, and keep the mirror in sync.
- Enforce permissions and validation on the server or database. UI checks only
  hide controls.
- Critical values (prices, totals, balances, roles, IDs, timestamps) are
  computed or checked on the trusted side, never taken from the client.
- Operations that change several records together run in one transaction.
- Operations that can be retried (payments, orders, submissions) are
  idempotent.
- Keep modules focused. Prefer extending an existing module over adding a new
  abstraction. No speculative generality.
- No new dependency when the language, framework or an existing dependency
  already does the job. Never re-add a dependency the project removed.

### Data and migrations

- Never edit a migration that has been applied. Add a new one.
- Every table that holds user or tenant data has access rules, and indexes on
  its foreign keys and common filters.
- Use exact types for money (decimal/integer minor units), never floats.
- Constrain data in the schema (not null, checks, unique, foreign keys), not
  only in code.
- Ledgers and audit logs are append-only.
- Look at what a destructive statement will touch before running it. Confirm
  first.

### Backend and APIs

- Validate all input at the boundary with the project's validation library.
- Authenticate every request; authorise every action. No bypass, demo token or
  debug backdoor.
- Return consistent error shapes with safe messages. Never leak stack traces,
  SQL, internal paths or secrets to clients. Log details server-side.
- Use least privilege: act with the caller's identity; reserve admin
  credentials for the few operations that truly need them.
- Escape or parameterise anything that goes into a query, filter, shell
  command, HTML or file path.
- Add rate limits and size limits on public or expensive endpoints.
- Inject dependencies so code can be tested without the network.

### Frontend

- Use the project's existing components, hooks, data layer and state approach.
- Data access goes through the project's service/data layer, not ad hoc calls
  inside components.
- Every async view handles loading, empty, error and no-permission states.
- Never show invented data. If a request fails, show the error with a retry.
- Keep bundles lean: lazy-load routes and heavy libraries where the project
  does.
- Forms validate before submit and show field-level errors; disable or show
  progress on submit to prevent double submission.

### Secrets and configuration

- Secrets live only in server-side environment variables. Never in client
  code, client env vars, logs, URLs, commits or screenshots.
- Never commit `.env` files or credentials. Keep `.env.example` current.
- Validate configuration at startup and fail with a clear message.
- Features that depend on optional config degrade with a clear explanation,
  not a crash.

### Tests

- Every behaviour change gets a test. Bugs get a test that fails before the
  fix and passes after.
- Include negative cases: wrong role, other user's data, invalid input,
  duplicate, retry.
- Use the project's test runner and patterns. Do not add a new test framework.
- Never delete, skip, weaken or special-case a test to make it pass.
- Tests must not depend on real networks, real credentials or wall-clock luck.

### Git

- Commit, push or open a pull request only when asked.
- Do not work directly on the default branch; create a branch first.
- Small, focused commits with messages in the project's style.
- Never force-push, rewrite shared history or discard others' changes without
  explicit instruction.

---

## 4. Design rules (any user interface)

- **Use the design system.** Colours, spacing, type and radii come from the
  project's tokens or theme. Never hard-code a hex colour or one-off value
  when a token exists. If no system exists, define tokens first, then build.
- **Colour carries meaning.** Reserve red, amber and green for status. One
  brand colour for primary actions. Do not decorate with status colours.
- **Build from existing components** before writing new markup. New
  components follow the same props and naming conventions as the old ones.
- **Design for the job.** Tools that people use all day are dense, calm and
  fast. Do not turn every screen into a grid of identical cards. Do not add
  gradients, glows or animation that carry no information.
- **Hierarchy:** one clear page title, one primary action per view, secondary
  actions quieter. Align numbers right with tabular figures. Use monospace for
  codes and identifiers.
- **Responsive:** works at 375 px wide with no horizontal page scroll. Wide
  tables scroll inside their own container. Touch targets are large enough.
- **Themes:** if the project supports dark mode, every new colour has a value
  in both themes and both are checked.
- **Accessibility:** semantic elements, labels on every input, `aria-label` on
  icon-only buttons, visible focus, keyboard reachable, dialogs trap and
  restore focus and close on Escape, sufficient contrast, reduced-motion
  respected.
- **States:** loading (skeleton or spinner), empty (say why and what to do
  next), error (say what happened and how to fix or retry), no permission.
- **Copy:** plain, specific, in the user's vocabulary. Buttons say what they
  do. Confirmations name the thing affected. Errors say how to fix.
- **Consequential actions** (delete, cancel, refund, suspend) ask for
  confirmation and, where the project audits, a reason.

---

## 5. Building a new project from scratch

When there is no project yet, work in this order:

1. **Clarify the product** in a few lines: who uses it, the core workflows,
   the data it owns, and what must never go wrong.
2. **Choose a boring, well-supported stack** that fits the user's skills and
   deployment target. State the choice and why in one or two lines.
3. **Design the data model first:** entities, relations, constraints,
   ownership and access rules. Decide the trust boundary and where rules are
   enforced.
4. **Lay out the folders by responsibility** (data access, domain logic, UI
   components, pages/routes, config, tests, docs). One module per domain.
5. **Build the vertical slice first:** one real workflow working end to end
   with real data, auth and error handling, before widening.
6. **Set up the checks on day one:** lint, tests, build, env validation, an
   `.env.example`, and a `.gitignore` that excludes secrets and build output.
7. **Establish design tokens and base components** before building screens.
8. **Write tests for the rules that matter most:** permissions, money, state
   changes, isolation between users.
9. **Write the docs:** README (what it is, setup, run, test, deploy) and a
   project `CLAUDE.md` using the template in §9.
10. **Verify everything runs from a clean install** before calling it done.

---

## 6. Debugging protocol

1. Reproduce the problem. Capture the exact error, input and environment.
2. Read the full error and stack. Read the code at that location and its
   callers.
3. Form one hypothesis. Find evidence that confirms or kills it (logs, a
   minimal test, a query).
4. Fix the root cause, not the symptom. No blanket try/catch, silent default,
   added retry or loosened check to hide it.
5. Add a test that fails without the fix.
6. Check for the same bug elsewhere in the codebase.
7. Re-run the full checks and report what the cause was.

---

## 7. Mistakes weaker models make, and how to avoid each

| Mistake | Why it is wrong | Do this instead |
|---|---|---|
| Coding from what the project "probably" looks like | Invented files, functions and commands break things | Read the real files first (§1 steps 2–4) |
| Reading only the first lines of a file | The part you skipped contained the rule | Read whole files; follow truncated output |
| Saying "done" or "tests pass" without running them | Fake completion (Law 3) | Run the checks and report the real output |
| Rewriting or reformatting working code | Risk and noise for no benefit (Law 2) | Touch only what the task needs |
| Starting to code before thinking through security and edge cases | Rework, holes, data bugs (Law 1) | Decide the approach first (§1 step 6) |
| Stopping at a plan when a change was requested | The user asked for the work | Do the work, then report |
| Silently doing less than asked | The user believes it is complete | Finish all of it, or list what is left and why |
| Adding features nobody asked for | Scope creep and new bugs | Stay inside the request; offer extras afterwards |
| Hard-coded sample data, random numbers or fake fallbacks | The app lies to its users | Use real data; show an error state on failure |
| Checking permissions only in the UI | Anyone can call the API directly | Enforce on the server or database |
| Trusting prices, totals, roles or IDs from the client | Trivially forged | Compute or verify on the trusted side |
| Using an admin/service credential for ordinary reads and writes | Bypasses every access rule | Act as the caller; least privilege |
| Putting a secret in client code or a client env var | It ships to every browser | Server-side env only |
| Editing an applied migration | Existing databases never re-run it | Add a new migration |
| Multi-step writes without a transaction | Partial state on failure | One transaction, all or nothing |
| No idempotency on retryable actions | Double charges and duplicate records | Idempotency key or natural unique constraint |
| Floats for money | Rounding drift | Decimal or integer minor units |
| Swallowing errors (`catch {}`), silent defaults | Hides the real failure | Surface it; fix the cause |
| Deleting, skipping or loosening a failing test | Hides a regression | Fix the code, or fix the test with a stated reason |
| Adding a new library, framework or pattern | Two ways to do one thing | Use what the project already has |
| Creating a helper that already exists | Duplicated logic drifts apart | Search first, reuse |
| Hard-coded colours and one-off spacing | Breaks themes and consistency | Use tokens and existing components |
| No loading, empty or error state | Blank or broken screens | Handle all four states |
| Layout that breaks on phones | Real users are on small screens | Check 375 px; scroll tables in a container |
| Unescaped user input in queries, filters, HTML or shell | Injection | Parameterise or escape |
| Leaking raw database or stack errors to users | Information disclosure, bad UX | Safe message to client, detail to logs |
| Bypassing a failing hook, linter or check | It exists for a reason | Read it, satisfy it, retry |
| Repeating the same failed fix | No new information | Stop, re-read, test a different hypothesis |
| Running destructive commands without looking | Irreversible data loss | Inspect the target, confirm first |
| Committing or pushing without being asked | Not yours to decide | Wait for the instruction |
| Long, vague final messages | The outcome is buried | Lead with the result; be specific |
| Claiming hosted services, devices or third-party APIs were verified when only local tests ran | Misleading | State exactly what was and was not exercised |

---

## 8. Definition of done — run before saying a task is complete

Run the project's own commands and report the actual results. "Should work"
is not done.

1. **Read before write:** every changed file, its callers and its tests were
   read before editing.
2. **Thought through:** architecture fit, security, scale and edge cases were
   considered and the approach reflects that.
3. **Scope:** the whole request is implemented. Anything left out is listed
   with the reason. Nothing unrequested was added or rewritten.
4. **Lint and type-check:** pass.
5. **Tests:** pass, with new tests for the new behaviour including a negative
   case. No test was removed, skipped or weakened.
6. **Build:** succeeds.
7. **Ran it for real:** the change was exercised in the running app, endpoint
   or command; logs and console are clean.
8. **Security:** no secrets exposed; inputs validated; permissions enforced on
   the trusted side; no bypasses.
9. **Data:** migrations are new files; multi-step writes are transactional;
   nothing destructive ran without confirmation.
10. **UI (if any):** tokens and existing components used; loading, empty,
    error and no-permission states present; small screen and both themes
    checked; keyboard and screen-reader basics in place.
11. **Diff reviewed:** no debug code, dead code, unrelated edits or
    formatting noise.
12. **Docs:** README, env example and the project `CLAUDE.md` updated if
    commands, config or behaviour changed.
13. **Honest report:** what was verified and how, what was not and why, and
    the output of anything that failed.

---

## 9. When a project has no CLAUDE.md

After finishing a non-trivial task in such a project, offer to write one. It
must be based on files you actually read and commands you actually ran, and
contain:

1. **Working protocol** — the read-first steps, with this project's real
   file names for schema, tests and permissions.
2. **What the project is** — the product, its users, its domain conventions.
3. **How it is built** — stack per layer, the data flow, the trust boundary.
4. **Folder map** — every directory and key file with one line each.
5. **Commands** — install, run, lint, each test suite, build, seed, deploy,
   verified by running them, with the baseline pass counts.
6. **Coding rules** — architecture rules, data/migration rules, backend rules,
   frontend rules, test rules, specific to this codebase.
7. **Design rules** — the tokens, components, layout, themes and tone actually
   used.
8. **Mistakes to avoid** — a table of project-specific pitfalls: mistake, why
   it is wrong here, what to do instead.
9. **Domain facts** — roles, numbering, calculations, known gaps.
10. **Definition of done** — the exact commands plus a project-specific
    checklist.

Also add an `AGENTS.md` at the repo root that points other tools to it.
