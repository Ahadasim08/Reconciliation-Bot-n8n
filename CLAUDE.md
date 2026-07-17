# Project: Reconciliation Bot

## FIRST ACTION EVERY SESSION
1. Read `progress.md` in full. It is the state of the world.
2. Read `PLAN.md` if you need scope context. PLAN.md is LOCKED — do not modify it.
3. Read `docs/CONTRACT.md`. Never change the data shape without asking.
4. State what you understand the current phase and next task to be. Wait for confirmation.
5. If `progress.md` says the previous session was closed and lists a "Next session — start here"
   list, treat that as the task for THIS session, regardless of what the user's opening message says
   (unless the user's message clearly redirects you — e.g. explicitly asks for something else).

## GIT RULES — NON-NEGOTIABLE
- NEVER add "Co-Authored-By: Claude" to any commit.
- NEVER add "Generated with Claude Code" or any variant.
- NEVER mention Claude, Claude Code, AI, or an assistant in a commit message,
  code comment, PR, or documentation.
- Commits are authored solely by the repo owner (check `git config user.name`/`user.email`
  before the first commit of the session — Ahad's machine commits as Ahad, Murad's as Murad).
- Commit messages: lowercase, imperative, plain. No emoji. No conventional-commit prefixes.
- Confirm `.claude/settings.json` has `{ "includeCoAuthoredBy": false }` before the first commit.
- After commit #1 of the session, run `git log -1 --format='%an <%ae>%n%B'` and verify it's clean.

## SCOPE RULES
- PLAN.md is locked. If something in it seems wrong, SAY SO — do not silently deviate.
- Do not build anything not in PLAN.md. If it seems like a good idea, add it to
  progress.md under "Ideas parked" and move on.
- Non-goals are in PLAN.md section 1. Respect them. No dashboard. No LLM in the matcher.
- One phase per session. Do not start the next phase even if there's time left —
  note it as the start of next session instead.

## CODE RULES
- `src/matcher.js` is a PURE FUNCTION. No I/O, no API calls, no console.log,
  no reading the current date. Everything is an argument.
- `src/matcher.js`, `src/classify.js`, `src/format.js` must NEVER contain the
  string "hubspot", "stripe", or any vendor name. They see the contract shape only.
- `workflow/workflow.json` is GENERATED. Never hand-edit it. Edit src/*.js
  and run `npm run build`.
- Every threshold goes in config. No magic numbers.
- Every new edge case gets a test before the fix.

## LAST ACTION EVERY SESSION
When the user says "close the session" (or clearly signals they're wrapping up), update
`progress.md` before doing anything else:
- Update "Last updated" (date, who, session number +1)
- Update "Current phase" and "Days elapsed" if changed
- Rewrite the "Status" paragraph so a stranger understands the real state
- Check off / add to "Done"
- Add a new "Session N — what happened" section
- Add any newly solved problems to "Problems solved"
- Update "Blockers" (add new, remove resolved)
- Overwrite "Next session — start here" with the concrete next steps
- Add anything parked to "Ideas parked"
- Add any real decisions to "Decisions log"
Then remind the user to push. Do not skip this even if the session was short or nothing
shippable got done — a session that doesn't update progress.md didn't happen.
