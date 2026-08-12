# ZT.AI Public Portfolio Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public portfolio's project and resume pages into interview-ready pages, unify the downloadable resume, update the avatar, and add a silent local gateway shortcut.

**Architecture:** Keep the existing React single-page navigation and chat implementation. Add resume content as structured React data in `src/main.jsx`, use the existing visual language plus scoped CSS for responsive layout, and keep the local gateway launcher as a separate PowerShell script with a Windows shortcut pointing to it.

**Tech Stack:** React, Vite, Lucide React, Node HTTP gateway, PowerShell/WScript Shell shortcut, GitHub Pages `pages` branch, Render auto-deploy from `main`.

---

### Task 1: Replace public resume and avatar assets

**Files:**
- Copy source: `C:\Users\Administrator\Documents\ChatGPT\总结工作优化简历\蔡宙廷_个人简历.docx`
- Copy source: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-e7bfcb11-c931-409f-8460-ca39120e2f4e.png`
- Modify: `E:\ZT.AI\zt-ai-web\src\main.jsx`
- Create: `E:\ZT.AI\zt-ai-web\src\assets\resume-avatar.png`
- Replace: `E:\ZT.AI\zt-ai-web\public\resume.docx`

- [ ] Copy the supplied DOCX to `public\resume.docx` and the supplied portrait to `src\assets\resume-avatar.png`.
- [ ] Change the avatar import to `./assets/resume-avatar.png`; keep the existing `resumeDoc` URL so all download controls share one file.
- [ ] Verify neither asset is empty and the DOCX byte length matches the supplied file.

### Task 2: Make project and resume pages complete

**Files:**
- Modify: `E:\ZT.AI\zt-ai-web\src\main.jsx`
- Modify: `E:\ZT.AI\zt-ai-web\src\styles.css`

- [ ] Convert the GitHub feature card from a button-only shell to an anchor with `href="https://github.com/niuzipai-gif?tab=repositories"`, `target="_blank"`, and `rel="noreferrer"`.
- [ ] Add structured data for the resume: identity, core metrics, current and previous work, detailed 坤信 workflow, previous projects, skills, education, and transferable methods using only the supplied resume content.
- [ ] Replace `ResumePage`'s two-card timeline with the full structured sections and a single download CTA pointing to `resumeDoc`.
- [ ] Add scoped styles for metric cards, resume sections, work timeline, skill chips, method cards, anchor hover states, and mobile single-column layout. Keep the existing home/chat styles untouched.

### Task 3: Add silent local gateway launcher

**Files:**
- Create: `E:\ZT.AI\zt-ai-web\start-gateway.ps1`
- Create: `E:\ZT.AI\zt-ai-web\tools\zt-ai.ico`
- Modify: `E:\ZT.AI\zt-ai-web\.gitignore`
- Create external shortcut: `C:\Users\Administrator\Desktop\ZT.AI 网关-静默启动.lnk`

- [ ] Add a PowerShell script that uses project-local working directory, checks TCP port 8790, and starts `node server/src/index.js` with hidden window and redirected logs only when no listener exists.
- [ ] Convert the supplied project logo PNG to an ICO resource and use it for the shortcut.
- [ ] Create a WScript Shell shortcut targeting `powershell.exe` with `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File` and the project script path.
- [ ] Inspect the shortcut target, arguments, working directory, and icon path; do not launch a second gateway if 8790 is already listening.

### Task 4: Test, build, publish, and verify

**Files:**
- Modify: generated `dist/` and `pages` branch artifacts only during release.

- [ ] Run `npm test` and `npm run build` on `main`.
- [ ] Build Pages with `VITE_API_BASE_URL=https://zt-ai-gateway.onrender.com` and `GITHUB_PAGES_BUILD=true`; copy `public\resume.docx` into `dist\resume.docx`.
- [ ] Commit source changes to `main` and push; let Render deploy the gateway.
- [ ] Force-publish the `dist` contents plus `resume.docx` to the `pages` branch, then return to `main`.
- [ ] Verify the Pages HTML/JS loads, GitHub target is present, `/zt-ai-web/resume.docx` is HTTP 200 with the supplied byte length, and no API key string appears in the public bundle.
