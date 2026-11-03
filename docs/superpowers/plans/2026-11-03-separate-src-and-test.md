# Separate CLI Source and Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cleanly separate `packages/cli` into `src/` (production code only) and `test/` (unit tests only), updating `tsconfig.json`, `package.json`, and import paths while keeping all 166 tests passing and npm builds intact.

**Architecture:**
- Move all `*.test.ts` files from `packages/cli/src/` to `packages/cli/test/`.
- In `test/*.test.ts`, update relative imports from `./<module>.js` to `../src/<module>.js` (or `../dist/<module>.js` after build).
- In `tsconfig.json`:
  - `rootDir` stays root or adapts to compile `src` -> `dist/src` (or keep `rootDir: "."` with `outDir: "dist"`).
  - Alternatively: compile `src` -> `dist` for npm distribution (`files: ["dist/*.js", "!dist/*.test.js"]`), and use `ts-node` or compile `test` to `dist/test`.
  - Let's check the cleanest TS pattern:
    - `tsconfig.json`: `rootDir: "src"`, `outDir: "dist"` (only compiles production files!).
    - `tsconfig.test.json` or include both with `outDir: "dist"`.
    - If `tsconfig.json` has `rootDir: "."`, then `dist/src` and `dist/test` are generated.
    - If we want `package.json`'s `bin: { "course": "dist/course.js" }` to stay unchanged without breaking package exports, compiling `src` directly into `dist/` is ideal!
    - For tests: `tsconfig.test.json` or running node test directly.
    - Let's verify how `npm run build && node --test dist/*.test.js` or `node --test dist/**/*.test.js` runs.
- Keep distribution clean so that `npm pack` only packages production `dist/*.js` files.

**Tech Stack:** TypeScript, Node.js Test Runner.

---

### Task 1: Move Test Files to `packages/cli/test/` and Update Imports

**Files:**
- Move: `packages/cli/src/*.test.ts` -> `packages/cli/test/*.test.ts`
- Modify: `packages/cli/test/*.test.ts` (imports pointing to `../src/*.js`)

- [ ] **Step 1: Create `packages/cli/test` and move test files via `git mv`**
- [ ] **Step 2: Update imports in `test/*.test.ts`**
- [ ] **Step 3: Update `packages/cli/tsconfig.json` to include both `src` and `test`**
- [ ] **Step 4: Update `package.json` test script and bin path if needed**
- [ ] **Step 5: Run tests and verify 166/166 pass**
- [ ] **Step 6: Commit**

---

### Task 2: Verify Build & Packaging

**Files:**
- Modify: `packages/cli/package.json` (ensure `files` array excludes `test` output)

- [ ] **Step 1: Check `npm pack --dry-run` to verify test files are NOT included in npm tarball**
- [ ] **Step 2: Run full project test suite**
- [ ] **Step 3: Commit and push**
