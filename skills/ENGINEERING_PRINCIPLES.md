# Engineering Principles for `chinese-learner`

> A working document for humans and AI assistants. When implementing a new feature or refactoring an old one, follow these rules unless there is a specific, written reason not to.

This file describes **how** we build, not **what** we build. It is tuned to the realities of this project: vanilla JS, Supabase backend, AI proxy on Vercel, no build step (yet), Vietnamese-language UI for a Chinese-learning app.

---

## Table of contents

1. [Core philosophy](#1-core-philosophy)
2. [Reusability](#2-reusability)
3. [OOP and code organization](#3-oop-and-code-organization)
4. [Database and persistence](#4-database-and-persistence)
5. [State management](#5-state-management)
6. [Error handling](#6-error-handling)
7. [Security](#7-security)
8. [Performance](#8-performance)
9. [Naming and style](#9-naming-and-style)
10. [Testing and verification](#10-testing-and-verification)
11. [Working with AI providers](#11-working-with-ai-providers)
12. [Adding a new feature: the checklist](#12-adding-a-new-feature-the-checklist)

---

## 1. Core philosophy

### 1.1. Write code that you can delete
Every line is a liability. The shorter, more focused, and less coupled a piece of code is, the cheaper it is to remove or replace later. When in doubt, prefer the smaller solution.

### 1.2. Optimize for change, not for cleverness
This is a learning app that will keep evolving. Code is read 10x more than it is written and modified 5x more than it is read. A boring, predictable solution beats a clever one every time.

### 1.3. The next person is the AI
This codebase will likely be touched by AI assistants. That means:
- Names should be self-explanatory; don't rely on tribal knowledge.
- Each file should make sense in isolation.
- Comments should explain *why*, not *what* (the code shows what).
- File and function purposes should be guessable from their name alone.

### 1.4. Don't break working code to chase patterns
If a refactor is "cleaner" but adds risk to a working feature, defer it. New patterns should be introduced when *adding* features, then propagated to old code only when those files are touched anyway.

---

## 2. Reusability

### 2.1. Write it once, use it everywhere
If the same logic appears in two places, factor it out on the third occurrence. Not the second — premature abstraction is worse than duplication. But the third time, stop and extract.

### 2.2. Centralize configuration and credentials
- All Supabase URLs and keys live in **one** file: `public/js/db-config.js`.
- All AI model names, max-token limits, and prompts live in **one** file: `public/js/ai-config.js`.
- All localStorage key strings live in `public/js/storage-keys.js` as a frozen object.

If you find yourself typing the same string literal in two files, it belongs in a config module.

### 2.3. Generic over specific
When two functions differ only in a parameter (a table name, a field, a label), write one function that takes that parameter. Example: a `Repository` class that takes a table name beats nine near-identical classes for `posts`, `courses`, `books`, etc.

### 2.4. UI components are functions
Card layouts, modals, list rows, badges — extract them into pure functions that take data and return HTML strings (or DOM nodes). Never copy-paste an HTML block. If you've written `<div class="card">...` twice, extract `card(data)`.

### 2.5. Reusability checklist before committing
- [ ] Is any string literal duplicated? Move to config.
- [ ] Is any HTML block duplicated? Extract a render function.
- [ ] Is any logic duplicated? Extract a helper.
- [ ] Could a future feature reuse this? Make it generic, but only if doing so doesn't bend it out of shape.

---

## 3. OOP and code organization

### 3.1. Three layers per feature
Every non-trivial feature should split into three concerns:

| Layer | Responsibility | Knows about DOM? | Knows about network? |
|---|---|---|---|
| **Model** | Data shape, business rules | No | No |
| **Service** | Network/AI/storage I/O | No | Yes |
| **View** | Rendering, DOM events | Yes | No |

Example for SRS:
- `SrsCard` (model): `due()`, `review(rating)`, `intervalDays`. Pure data.
- `SrsRepository` (service): `loadDueCards()`, `saveCard()`. Wraps Supabase.
- `SrsStudyView` (view): renders the flashcard, captures the rating button click, calls the model and the repository.

### 3.2. Dependency injection over globals
Never reach for `app.foo` from inside a class. Pass `foo` to the constructor. This is the single most important rule for code quality.

```js
// Bad
class VocabManager {
  render() {
    const inFC = app.flashcards.has(w.char);
  }
}

// Good
class VocabManager {
  constructor({ ai, db, flashcards, handwriting }) {
    this.flashcards = flashcards;
    // ...
  }
  render() {
    const inFC = this.flashcards.has(w.char);
  }
}
```

This makes the class testable, replaceable, and self-contained.

### 3.3. Object parameters over positional parameters
For three or more arguments, use a single object. Order doesn't matter, names are self-documenting, future additions don't break callers.

```js
// Bad
new VocabManager(ai, db, flashcards, handwriting, config);

// Good
new VocabManager({ ai, db, flashcards, handwriting, config });
```

### 3.4. One class per file
File name matches class name. `SrsScheduler` lives in `public/js/srs-scheduler.js`. No exceptions.

### 3.5. Private methods start with underscore
`_renderInterleaved`, `_handleKey`. JS doesn't enforce it, but the convention signals "do not call from outside." Public surface is everything without an underscore.

### 3.6. Avoid inheritance; prefer composition
Don't extend `BaseManager` to share a logger. Pass the logger in. Inheritance is appropriate only when there's a true is-a relationship and shared state. For shared *behavior*, compose: pass collaborators in.

### 3.7. Cross-cutting communication: use an event bus
When a state change must notify three or more parts of the app (e.g. "lesson changed" → reset chat + clear vocab + clear selection + reset buttons), don't have one class call methods on five others. Emit an event; let interested parties subscribe.

```js
bus.emit('lesson:changed', newLesson);
// Each manager subscribes once during construction:
bus.on('lesson:changed', l => this.reset(l));
```

### 3.8. The "doesn't reach across" rule
Read your class. If it does `someOtherManager.privateField = ...` or `app.something.something.something`, it's reaching across. Refactor by either passing a collaborator in, or emitting an event.

---

## 4. Database and persistence

### 4.1. One Supabase client, one source of truth
Initialize the client in `db-config.js`. Every other file imports it. Never call `supabase.createClient(...)` outside that file.

### 4.2. Always check for errors
Every Supabase call returns `{ data, error }`. Never destructure only `data` and ignore `error`.

```js
// Bad
const { data } = await client.from('lessons').select('*');
return data || [];  // errors silently become empty arrays

// Good
const { data, error } = await client.from('lessons').select('*');
if (error) {
  console.error('[lessons] load failed:', error);
  throw new DbError('Could not load lessons', error);
}
return data;
```

If you genuinely want to fall back on error, log first, then return the fallback.

### 4.3. Repository pattern for tables
For any table with the standard list/get/save/delete shape, use the generic `Repository` class. Only write a custom subclass when the table has special behavior (joins, soft deletes, custom serialization).

### 4.4. Schema discipline
- Every table has `id` (uuid or bigint), `created_at`, `updated_at`.
- User-scoped tables have `user_id` referencing `auth.users`.
- Never store the same data under two different column names. If you migrate (`zh` → `chinese`), do it in one shot and remove the old column.
- Boolean flags get explicit defaults in the migration.

### 4.5. Row Level Security is mandatory
- **Public read tables** (`lessons`, `books`, `posts WHERE published`): RLS policy allowing anon SELECT only.
- **User-scoped tables** (`user_flashcards`, `reading_progress`, `listening_progress`): RLS policy `user_id = auth.uid()` for ALL operations.
- **Admin-only tables**: RLS policy checking against an `admins` table or a custom JWT claim.
- A new table without RLS configured is a security incident waiting to happen. Add the policies in the same migration that creates the table.

### 4.6. Never delete without scoping
`.delete().neq('id', 0)` deletes the entire table. Always scope deletes by user, by foreign key, or by an explicit ID.

```js
// Dangerous
await client.from('flashcards').delete().neq('id', 0);

// Safe
await client.from('flashcards')
  .delete()
  .eq('user_id', uid);
```

### 4.7. Prefer soft delete for user content
For lessons, posts, courses — anything an admin or user might regret deleting — use a `deleted_at` timestamp instead of `DELETE`. Filter with `.is('deleted_at', null)` everywhere. Hard deletes are reserved for irrelevant cache or junk.

### 4.8. Keep the DB layer dumb
The database module knows how to read and write rows. It does NOT know about UI, business rules, or validation. Validation belongs in models or services. This makes it easy to swap Supabase for something else later (or write tests with an in-memory fake).

---

## 5. State management

### 5.1. State has a single owner
Every piece of state has exactly one owner. Other code reads through that owner's public interface. If three classes need to "know" the current lesson, ONE of them owns it; the others ask.

### 5.2. localStorage is a cache, not a database
- Anything in localStorage must also exist in Supabase, or be acceptable to lose.
- Use localStorage to make UI feel instant; sync to DB asynchronously.
- Centralize all keys in `storage-keys.js` so renames are one-line edits.

### 5.3. URL params are state too
For shareable, bookmarkable state (current lesson, current section), use URL params. Don't store the active lesson ID only in memory.

### 5.4. Don't re-render the whole world
For lists with many items, render once and patch on change. Setting `innerHTML` on every update wipes input focus, scroll position, and animations.

### 5.5. Derive, don't duplicate
If `vocab.length` answers a question, don't store `vocabCount`. Computed values stay in sync automatically; cached values rot.

---

## 6. Error handling

### 6.1. Three categories of error, three responses

| Error type | Example | Response |
|---|---|---|
| **Expected, recoverable** | Network blip on save | Retry once, queue for later, show subtle UI hint |
| **Expected, unrecoverable** | Invalid AI response, missing API key | Show user-friendly message in UI, fall back if possible |
| **Bug** | Null reference, type error | Log fully, surface "something went wrong," capture stack |

### 6.2. Never write empty catches
```js
// Bad
try { ... } catch (e) {}

// Acceptable only if the error is truly ignorable AND you say so
try { writer.cancelQuiz(); } catch (e) { /* writer not initialized yet, fine */ }

// Good
try {
  ...
} catch (e) {
  console.error('[VocabManager] enrich failed:', e);
  this._showInlineError('Could not load definition');
}
```

### 6.3. Errors should reach the user when they affect the user
If the AI call fails and the user sees nothing, they don't know to retry. A small inline message ("Tải lại?") respects the user.

### 6.4. Log with context
`console.error('[ModuleName] action failed:', error)` — including the module and action prefix means logs are greppable and readable.

### 6.5. Validate AI output as if it's hostile
AI APIs return JSON that may not parse, may have wrong shape, may have missing fields. Always:
1. Try-catch the parse.
2. Validate shape (`Array.isArray`, required fields exist).
3. Have a fallback (demo data, a friendly error message).

---

## 7. Security

### 7.1. Trust no input, including AI input
Anything that came from a user, a URL, or a network response is untrusted. Sanitize before:
- Inserting into the DOM (use `textContent` by default, `innerHTML` only with sanitization).
- Building SQL or filter strings.
- Constructing file paths.

### 7.2. Default to `textContent`
If you're rendering user-supplied or AI-supplied data, use `textContent`. Reach for `innerHTML` only when you intentionally need HTML, and pass it through DOMPurify first.

### 7.3. Never put secrets in the browser
Anything in the JS bundle is public. The Supabase publishable key is *designed* to be public (RLS protects the data). API keys for paid services (Anthropic, OpenAI) are not — that's why we have the proxy.

### 7.4. The proxy must enforce origin and limits
- Lock CORS to your production domain, not `*`.
- Add basic rate limiting (per IP or per session).
- Log usage so abuse is visible.
- Long-term: store the API key as a Vercel env var, don't accept it from the browser at all.

### 7.5. CSP-friendly code
Avoid inline `onclick="..."`, inline `<script>`, and `eval`. Use `addEventListener` and `data-action` attributes. This lets you set a strict Content-Security-Policy header, which blocks many XSS classes outright.

---

## 8. Performance

### 8.1. Premature optimization is the root of evil — but so is profligate waste
Don't optimize what isn't slow. Do avoid obviously bad patterns.

### 8.2. Batch DB calls
If you need 5 fields from 5 different rows, write one query, not five. `Promise.all` for parallel queries to different tables.

### 8.3. Cache deliberately
If a Supabase query returns the same data for the whole session (book metadata, lesson list), cache it in memory. Invalidate on writes you control.

### 8.4. Lazy-load big stuff
The admin page is 2,800+ lines. The handwriting library is large. Load these only when needed — on the route or on user action. Never block initial page load on a feature 80% of users won't use.

### 8.5. Debounce expensive renders
If a user can trigger a render rapidly (typing, scrolling), debounce or throttle. 16ms minimum between frames for animations, 250ms for search-as-you-type.

---

## 9. Naming and style

### 9.1. Names describe intent, not type
- `flashcards`, not `flashcardsArray`.
- `dueCards`, not `cards1`.
- `parseAiResponse`, not `process`.

### 9.2. Booleans read like statements
`isReady`, `hasError`, `canEdit`, `shouldRetry`. Reading the code aloud should sound like English.

### 9.3. Functions are verbs, classes are nouns
- `loadLessons()`, `renderCard()`, `parseVocab()`.
- `LessonManager`, `VocabService`, `SrsCard`.

### 9.4. Consistency over preference
This codebase mixes Vietnamese comments with English identifiers. Going forward:
- **Code (variables, functions, classes, comments in code):** English. AI assistants and future contributors expect it.
- **User-facing strings:** Vietnamese. They're the product.
- **Commit messages, docs:** English.

### 9.5. Constants are SCREAMING_SNAKE_CASE
```js
const MAX_VOCAB_ITEMS = 25;
const STORAGE_KEYS = Object.freeze({ ... });
```

### 9.6. Indent and align for readability
The existing codebase aligns assignments and uses 2-space indents. Keep it consistent. Mixed style is worse than any single style.

---

## 10. Testing and verification

### 10.1. Manual testing protocol for any change
Before committing:
1. Open the affected page in a fresh browser session (no cached state).
2. Walk through the user flow that touches your change.
3. Open the console — there should be zero errors and zero warnings you introduced.
4. Test the failure path (no network, no API key, malformed data).

### 10.2. Add automated tests when patterns settle
Once a feature has stable interfaces, add tests. Start with the model layer (pure functions, no DOM, no network — easiest to test). Use Vitest or similar when you add a build step.

### 10.3. The "two-line check"
Before declaring a refactor done, search the codebase for the old pattern. Use grep:
```bash
grep -rn "supabase.createClient" public/
grep -rn "app.flashcards" public/
```
Refactors that miss two of seven sites cause subtle bugs.

### 10.4. The smoke test list
For this app specifically, every release must verify:
- [ ] Open a lesson, generate vocab, AI returns results
- [ ] Add a vocab word to flashcards
- [ ] Study flashcards (flip, navigate)
- [ ] Practice handwriting (animate, quiz)
- [ ] Switch AI provider in settings
- [ ] Reading progress persists after page reload

---

## 11. Working with AI providers

### 11.1. Verify model names
Anthropic and OpenAI model IDs change. Don't hardcode "what the docs said last month." Check the official docs and use exact dated IDs (e.g. `claude-sonnet-4-5-20250929`). Wrong model names fail silently in production.

### 11.2. Constrain output format
When asking AI for structured data, prefer the API's structured-output features (tool use for Anthropic, JSON mode for OpenAI). If those aren't available, repeat the JSON schema in the prompt and validate the response.

### 11.3. Always handle three failure modes
1. API error (rate limit, invalid key, network)
2. Malformed response (not JSON, wrong shape)
3. Empty/refused response

Each needs an explicit branch with user-visible feedback or graceful fallback.

### 11.4. Keep prompts in one place
All prompts live in `public/js/prompts.js` as named constants. Don't bury a 30-line prompt in the middle of a method. This makes prompts easy to iterate, version, and share between features.

### 11.5. Log AI cost-relevant info
Track token counts, latency, and provider in the console for every call. When you're surprised by a bill, you'll want this data.

---

## 12. Adding a new feature: the checklist

Before writing the first line of a new feature, fill this out:

- **What's the user-visible change?** One sentence.
- **What model classes does this need?** Sketch the data shape.
- **What service classes does this need?** Database? AI? Both?
- **What view classes does this need?** Where does it render?
- **What's the persistence story?** Supabase tables (with RLS), localStorage cache, or pure in-memory?
- **How does it integrate with existing features?** Direct calls (only if dependency-injected) or events?
- **What's the failure mode?** What does the user see when it goes wrong?

While building:

- [ ] Each class has one responsibility.
- [ ] No reaching for global `app.*` from inside a class.
- [ ] Dependencies passed in via constructor.
- [ ] All Supabase calls handle the `error` field.
- [ ] All AI responses are parsed defensively.
- [ ] User-facing strings are Vietnamese; code is English.
- [ ] No new hardcoded credentials, URLs, or secret strings.
- [ ] No inline `onclick`; use `addEventListener` or a delegated handler.
- [ ] All localStorage keys go in `storage-keys.js`.
- [ ] If a new table, RLS policies were added in the same migration.

After committing:

- [ ] Smoke test list (section 10.4) still passes.
- [ ] No new console errors or warnings.
- [ ] No duplicated logic introduced (grep the new patterns).

---

## Appendix: glossary

- **DI** (Dependency Injection): a class receives its collaborators as constructor arguments instead of fetching them from a global.
- **DRY** (Don't Repeat Yourself): if you've written the same thing twice, the third occurrence triggers extraction.
- **MVC / MVS**: Model-View-Controller / Model-View-Service. The split of data, rendering, and side effects.
- **RLS** (Row Level Security): Postgres feature that enforces row-level access rules at the database layer, regardless of which client connects.
- **SRS** (Spaced Repetition System): scheduling algorithm that shows flashcards right before you'd forget them.
- **SoC** (Separation of Concerns): a class or file should do one thing.
- **YAGNI** (You Aren't Gonna Need It): don't add abstractions or features for hypothetical future use cases. Add them when you actually need them.

---

*This document evolves with the project. When a rule causes friction or a new pattern proves itself, edit this file in the same commit. The rules are tools, not laws.*
