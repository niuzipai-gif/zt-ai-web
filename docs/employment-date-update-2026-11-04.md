# Kunxin employment dates — 2026-11-04

The user confirmed leaving Kunxin in November. The authoritative period is April–November 2026. No exact departure day, reason, or subsequent employer was supplied.

## Changes

- Chinese, English and Japanese resume pages now end in November 2026 and no longer carry the current-employment marker.
- Chat starter questions refer to past experience. The digital-twin profile explicitly states departure in November 2026 and overrides stale employment statements in older conversations without inventing details.
- All three website DOCX downloads and the translation builder use the corrected period. Seven local resume variants were updated with backups. DOCX edits preserve all original non-text XML, photographs, styling and package parts.
- The Chinese audit version remains based on the website's original two-page document. No voice, pronunciation, model, hosting plan or provider settings changed.

## Validation

- Nine existing profile/localization tests passed in the frontend and release worktrees; production build and diff checks passed.
- Headless browser checks at desktop/mobile widths verified all three localized dates, absence of the current marker, successful downloads and byte-for-byte download hashes. No page errors occurred.
- Public GitHub Pages checks passed for all languages. Real production chat answers in Chinese, English and Japanese returned April–November 2026 and confirmed departure.
- Render health reported revision `afa49564cac7f00e026d597740c984c680cf13e5`. Deploy `dep-dbl0f9l9el5s73f4jg50` reached `live` on the existing free service.
- Frontend source commit: `43cf2e5df4615c49841dc302e6b65d01ebe969dd`; Pages commit: `ce70daac190a4860bd9c3886488a569bbc612b09`; Pages workflow `41671689475` succeeded.
- Cloudflare version: `64572c1c-2435-4925-8449-bdb9e819cfad`. Upload acknowledgement connections repeatedly reset; a fresh deployment session confirmed no missing assets and completed successfully.
- Evidence: `output/employment-20261104/` for browser/chat results; local workspace `tmp/employment-20261104/` for DOCX backup hashes and rendered pages.

## Scope limitations

This was a date/status correction, preserving original resume templates. Existing narrow text boxes in the English/Japanese documents truncate portions of the prior translations; the corrected date lines are readable. Their layout was not redesigned in this task. Historical local backup files and already downloaded copies remain historical snapshots.
