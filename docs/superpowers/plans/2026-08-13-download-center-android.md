# Download Center and Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct desktop download link with a polished four-platform download center, fix the iPhone icon, build a real Android APK for the existing ZT.AI public chat experience, publish it beside the Windows artifacts, and connect the Android card to the uploaded APK.

**Architecture:** The website keeps its existing React SPA and adds a `downloads` page state reached from the top-right header. Platform metadata and labels live in `src/lib/i18n.js`; the Windows card links to the existing GitHub Release installer, while Android links to the uploaded APK only after a verified Release asset exists. The Android app is a small native WebView shell in `android-app/` that opens the public ZT.AI web chat, uses a dedicated application id and launcher label, and is built with a reproducible Gradle/Android SDK bootstrap script.

**Tech Stack:** React/Vite, lucide-react, GitHub Pages, GitHub Releases, Android Java WebView, Android Gradle Plugin, Gradle, Android SDK command-line tools.

---

### Task 1: Add download-center page data and navigation

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/lib/i18n.js`
- Modify: `src/lib/i18n.test.js`
- Modify: `src/styles.css`

- [ ] **Step 1: Add a dedicated downloads route state and platform copy for zh/en/ja.**

  Use the existing `page` state and `copy.nav` map; add `downloads` to all three nav maps and add the four-card labels, status text, descriptions, and Windows/Android URLs as copy fields so language switching does not leave the download page in a mixed language.

- [ ] **Step 2: Render the four-card download page.**

  Use inline SVG platform marks: a four-pane Windows mark, a phone outline for Android, a filled Apple logo for iPhone, and a laptop outline for macOS. Only Windows and Android may render enabled download buttons; iPhone and macOS stay disabled with the exact small “敬请期待” equivalent in each locale.

- [ ] **Step 3: Wire the top-right header button to `navigate('downloads')`.**

  Keep the button label and download icon, but make it an internal SPA navigation control so the user sees the download center before choosing a platform.

- [ ] **Step 4: Add responsive layout and icon contrast rules.**

  Keep the existing glass-gray visual language, use a two-column desktop grid and one-column mobile layout, and ensure the Apple mark is visibly the Apple silhouette rather than a generic device glyph.

- [ ] **Step 5: Add i18n regression assertions and run the website test suite.**

  Assert every locale has a downloads nav label, all four platforms, and a Windows download URL; run `npm test`.

### Task 2: Create and build the Android public-chat shell

**Files:**
- Create: `android-app/settings.gradle`
- Create: `android-app/build.gradle`
- Create: `android-app/gradle.properties`
- Create: `android-app/app/build.gradle`
- Create: `android-app/app/src/main/AndroidManifest.xml`
- Create: `android-app/app/src/main/java/com/ztai/mobile/MainActivity.java`
- Create: `android-app/app/src/main/res/values/strings.xml`
- Create: `android-app/app/src/main/res/values/colors.xml`
- Create: `android-app/app/src/main/res/values/themes.xml`
- Create: `android-app/app/src/main/res/drawable/ic_launcher_foreground.xml`
- Create: `android-app/app/src/main/res/drawable/ic_launcher_background.xml`
- Create: `tools/build-android.ps1`
- Create: `android-app/README.md`

- [ ] **Step 1: Add a native Android WebView project with a stable application id.**

  Use application id `com.ztai.mobile`, label `ZT.AI`, minSdk 24, and a current compile SDK installed by the bootstrap script. The manifest must request only `INTERNET`, enable cleartext only for local development through a debug-safe build flag if needed, and configure a launcher activity.

- [ ] **Step 2: Implement the WebView activity.**

  Load `https://niuzipai-gif.github.io/zt-ai-web/`, enable JavaScript, DOM storage, file chooser support, back navigation, safe external-link handling, and a loading/error state. The activity must not embed API keys; all chat traffic continues through the public Render gateway used by the website.

- [ ] **Step 3: Add the ZT.AI icon/theme resources.**

  Use a gold/gray launcher treatment consistent with the existing ZT.AI mark and keep the app label distinct from the desktop package.

- [ ] **Step 4: Bootstrap Android SDK and Gradle reproducibly.**

  `tools/build-android.ps1` must locate or install a local SDK under `android-toolchain/`, accept the required licenses non-interactively, install the compile/build platform packages, and run the Gradle wrapper task `:app:assembleRelease`.

- [ ] **Step 5: Build and inspect the APK.**

  Verify the APK exists, has application id `com.ztai.mobile`, is signed with the debug/release test key available to the build, and contains the public Pages URL. Record size and SHA-256 in the release notes.

### Task 3: Publish assets and connect the Android card

**Files:**
- Modify: `src/lib/i18n.js`
- Modify: `tools/publish-pages.ps1` only if the final build needs a static asset copy
- Modify: `README.md` or `android-app/README.md` with the public APK URL

- [ ] **Step 1: Upload the verified APK to GitHub Release `v0.2.1`.**

  Use asset name `ZT.AI-Android-0.2.1.apk`; do not expose an unbuilt or placeholder URL.

- [ ] **Step 2: Change the Android card to the real Release download URL.**

  Keep iPhone and macOS disabled; enable Android only after the Release asset returns HTTP 200 and its content length matches the local APK.

- [ ] **Step 3: Rebuild and deploy the GitHub Pages branch.**

  Run `npm run publish:pages`, copy `dist` into `.pages-deploy`, commit the generated Pages assets, and push `origin HEAD:pages`.

### Task 4: End-to-end verification

- [ ] **Step 1: Run `npm test`, `npm run agent:test`, and `npm run desktop:test`.**
- [ ] **Step 2: Verify the public Pages JS contains the downloads route, corrected Apple icon, and Android Release URL.**
- [ ] **Step 3: Verify Windows installer and Android APK Release assets return HTTP 200.**
- [ ] **Step 4: Verify the old direct header URL is no longer the header action and the download page is reachable from the header.**
- [ ] **Step 5: Report exact website, Release, APK, and local fallback paths.**

---

## Self-review

- The Windows artifact remains the existing tested 0.2.1 installer.
- Android is not presented as available until a real APK is built and uploaded.
- iPhone and macOS remain disabled and do not expose fake download links.
- Platform labels are localized together with the rest of the website.
- No API key is shipped in the Android app.
