# Project Case Study Demos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add smooth, replayable implementation-flow demos to all three selected projects and replace generic GitHub links with accurate public project evidence.

**Architecture:** Keep project content, localized step labels, and repository URLs in `src/lib/project-details.js`. Add a small pure flow-state helper for deterministic step transitions and a focused React `ProjectFlowDemo` component that owns only timer and interaction state. Create one public sanitized case-study repository for the two projects without a suitable public repository, while linking the image workflow to the existing LinkFox SOP repository.

**Tech Stack:** React, Vite, CSS animations/transitions, Node built-in test runner, GitHub CLI, GitHub Pages deployment.

---

### Task 1: Add flow-demo data and deterministic state helpers

**Files:**
- Create: `src/lib/project-flow.js`
- Create: `src/lib/project-flow.test.js`
- Modify: `src/lib/project-details.js`
- Modify: `src/lib/project-details.test.js`

- [ ] **Step 1: Write failing tests for five-step data and state transitions**

Add assertions that every language/project has exactly five non-empty flow steps with stable ids, that `nextFlowIndex` advances and clamps at the last step, and that `flowProgress` returns 0 at the first step and 1 at the last step.

```js
import { nextFlowIndex, flowProgress } from './project-flow.js'

test('each project exposes five localized demo steps', () => {
  for (const language of ['zh', 'en', 'ja']) {
    for (const detail of getProjectDetails(language)) {
      assert.deepEqual(detail.flowDemo.steps.map(step => step.id), ['input', 'decision', 'execution', 'qa', 'result'])
      assert.ok(detail.flowDemo.steps.every(step => step.label && step.description))
    }
  }
})

test('flow state advances without passing the result step', () => {
  assert.equal(nextFlowIndex(0, 5), 1)
  assert.equal(nextFlowIndex(4, 5), 4)
  assert.equal(flowProgress(0, 5), 0)
  assert.equal(flowProgress(4, 5), 1)
})
```

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

Run:

```powershell
node --test src/lib/project-flow.test.js src/lib/project-details.test.js
```

Expected: FAIL because `project-flow.js` and `flowDemo` do not exist yet.

- [ ] **Step 3: Implement the minimal data and pure helpers**

Add `flowDemo` to each localized project with the same five ids and language-specific labels/descriptions. Add:

```js
export function nextFlowIndex(currentIndex, stepCount) {
  const lastIndex = Math.max(0, Number(stepCount) - 1)
  return Math.min(lastIndex, Math.max(0, Number(currentIndex) + 1))
}

export function flowProgress(index, stepCount) {
  const lastIndex = Math.max(0, Number(stepCount) - 1)
  return lastIndex === 0 ? 1 : Math.min(1, Math.max(0, Number(index) / lastIndex))
}
```

Also move the public GitHub URLs into named exports: `CASE_STUDIES_GITHUB_URL`, `LINKFOX_GITHUB_URL`, and expose each project’s `repository` field so JSX does not hard-code project links.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run the same command. Expected: all project-detail and project-flow assertions pass.

- [ ] **Step 5: Commit the data contract**

```powershell
git add src/lib/project-flow.js src/lib/project-flow.test.js src/lib/project-details.js src/lib/project-details.test.js
git commit -m "feat: add localized project flow demo data"
```

### Task 2: Build the replayable project-flow component

**Files:**
- Create: `src/components/ProjectFlowDemo.jsx`
- Create: `src/lib/project-flow-ui.js`
- Create: `src/lib/project-flow-ui.test.js`
- Modify: `src/main.jsx`

- [ ] **Step 1: Write failing UI contract tests**

Test the component contract through exported pure labels/configuration: it must expose a play/replay label, render five step ids, allow a selected index, and stop at the result step. Keep the test independent of network and browser audio.

```js
test('flow demo contract supports replay and manual selection', () => {
  const state = createFlowDemoState(5)
  assert.equal(state.index, 0)
  assert.equal(state.mode, 'auto')
  assert.equal(selectFlowStep(state, 3).index, 3)
  assert.equal(selectFlowStep(state, 3).mode, 'manual')
  assert.equal(finishFlowDemo(state).index, 4)
})
```

- [ ] **Step 2: Run the focused UI contract test and confirm it fails**

Run:

```powershell
node --test src/lib/project-flow-ui.test.js
```

Expected: FAIL because the state helpers do not exist.

- [ ] **Step 3: Implement the state helpers and React component**

Create `src/lib/project-flow-ui.js` with `createFlowDemoState`, `selectFlowStep`, and `finishFlowDemo`. Create `ProjectFlowDemo.jsx` that:

- starts at step 0 and advances once per approximately 1100 ms;
- stops at the final step instead of looping;
- clears its timer when the component unmounts, when a project changes, or when the user selects a step;
- uses a replay button to return to step 0 and resume;
- marks the active step with `aria-current="step"`;
- renders a progress rail using `flowProgress`;
- renders localised `play`, `replay`, and `demoNote` labels supplied by `ui`;
- adds stable class names but no network calls.

- [ ] **Step 4: Integrate the component into the detail page**

In `ProjectDetail`, render `<ProjectFlowDemo flowDemo={detail.flowDemo} ui={ui} />` between the problem panel and the contribution/workflow grid. Pass the project’s `repository` URL into its evidence list and replace the bottom GitHub card href with `CASE_STUDIES_GITHUB_URL`.

- [ ] **Step 5: Run focused tests and build**

```powershell
node --test src/lib/project-flow.test.js src/lib/project-flow-ui.test.js src/lib/project-details.test.js
npm run build
```

Expected: all focused tests pass and Vite exits with code 0.

- [ ] **Step 6: Commit the component integration**

```powershell
git add src/components/ProjectFlowDemo.jsx src/lib/project-flow-ui.js src/lib/project-flow-ui.test.js src/main.jsx
git commit -m "feat: add replayable project flow demos"
```

### Task 3: Add responsive styling and reduced-motion behavior

**Files:**
- Modify: `src/styles.css`
- Modify: `src/lib/public-style-contract.test.js`

- [ ] **Step 1: Add failing style-contract assertions**

Assert that the stylesheet contains the flow demo shell, active step state, mobile vertical layout, and `prefers-reduced-motion: reduce` rule.

- [ ] **Step 2: Run the style contract and confirm it fails**

```powershell
node --test src/lib/public-style-contract.test.js
```

- [ ] **Step 3: Add desktop, mobile, focus, and reduced-motion styles**

Use a horizontal rail on desktop and a vertical rail below 800px. Animate only opacity, transform, and the rail scale; keep the step copy readable. Add visible keyboard focus and disable transition/animation under reduced motion.

- [ ] **Step 4: Run style tests and build**

```powershell
node --test src/lib/public-style-contract.test.js
npm run build
```

- [ ] **Step 5: Commit the visual behavior**

```powershell
git add src/styles.css src/lib/public-style-contract.test.js
git commit -m "feat: style responsive project flow demos"
```

### Task 4: Create and publish the sanitized public case-study repository

**Files:**
- Create outside the app worktree: `E:/ZT.AI/zt-ai-project-case-studies/README.md`
- Create: `E:/ZT.AI/zt-ai-project-case-studies/cases/selection-workflow.md`
- Create: `E:/ZT.AI/zt-ai-project-case-studies/cases/image-production.md`
- Create: `E:/ZT.AI/zt-ai-project-case-studies/cases/profit-loop.md`

- [ ] **Step 1: Check whether the target repository already exists**

```powershell
gh repo view niuzipai-gif/zt-ai-project-case-studies --json name,url,isPrivate,defaultBranchRef
```

If it does not exist, create it as public with a description stating that it contains sanitized ZT.AI project case studies. Do not add credentials, private links, supplier names, customer information, or raw internal exports.

- [ ] **Step 2: Write the README and three case files**

Each case file must contain: context, problem, operation flow, decision gates, acceptance checks, tools by category, and explicit limits on what is not claimed. The README must link to the three case files and the live ZT.AI site.

- [ ] **Step 3: Validate content before upload**

```powershell
rg -n "API[_ -]?KEY|SECRET|TOKEN|password|供应商手机号|客户姓名|内部链接" E:/ZT.AI/zt-ai-project-case-studies
```

Expected: no matches. Review the diff and file list before pushing.

- [ ] **Step 4: Commit and push the new repository**

```powershell
git -C E:/ZT.AI/zt-ai-project-case-studies init -b main
git -C E:/ZT.AI/zt-ai-project-case-studies add README.md cases
git -C E:/ZT.AI/zt-ai-project-case-studies commit -m "docs: publish sanitized ZT.AI project case studies"
gh repo create niuzipai-gif/zt-ai-project-case-studies --public --source E:/ZT.AI/zt-ai-project-case-studies --remote origin --push --description "Sanitized ZT.AI project case studies and operating workflows"
```

- [ ] **Step 5: Verify the public repository**

```powershell
gh repo view niuzipai-gif/zt-ai-project-case-studies --json name,url,isPrivate,defaultBranchRef
gh api repos/niuzipai-gif/zt-ai-project-case-studies/contents/README.md --jq '.download_url'
```

Expected: `isPrivate` is false, default branch is `main`, and README is available.

### Task 5: Publish the website and verify all public paths

**Files:**
- Modify only generated Pages output in `E:/ZT.AI/zt-ai-web/.pages-deploy`

- [ ] **Step 1: Run the complete project test suite**

```powershell
npm test
```

Expected: zero failures, including the new flow tests.

- [ ] **Step 2: Build and copy the Pages artifact**

```powershell
npm run build
Copy-Item -Path 'E:/ZT.AI/zt-ai-web/.worktrees/human-centered-ux/dist/*' -Destination 'E:/ZT.AI/zt-ai-web/.pages-deploy' -Recurse -Force
```

- [ ] **Step 3: Commit and push the Pages worktree**

```powershell
git -C E:/ZT.AI/zt-ai-web/.pages-deploy add -A
git -C E:/ZT.AI/zt-ai-web/.pages-deploy commit -m "deploy: publish project case study demos"
git -C E:/ZT.AI/zt-ai-web/.pages-deploy push origin HEAD:pages
```

- [ ] **Step 4: Verify source and deployment state**

Check that the source worktree contains only the intended commits plus the pre-existing `.design-audit/` and `.runtime-qa/` directories, and that the Pages worktree is clean after the push.

- [ ] **Step 5: Verify the live site and links**

Use GET requests to check 200 responses for the home page, project page, and the `zt-ai-project-case-studies` GitHub repository page. Verify the live HTML contains the project-flow output text, the new case-study repository URL, and the LinkFox repository URL. Verify Render `/api/health` still returns 200.

- [ ] **Step 6: Report exact results**

Report the commits, public repository URL, Pages URL, project-link mapping, test/build counts, and any remaining limitation without claiming physical-device verification that was not performed.
