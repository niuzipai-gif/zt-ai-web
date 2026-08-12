# ZT.AI responsive web QA

## Source visual truth

- Source: the user-provided screenshots `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-d9392c1b-59ef-4057-9cf6-bf32d6aba96b.png` and `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-3fe82e28-a520-4032-ae78-9b3970e8d601.png`, plus the supplied logo reference `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-c6b2d21d-3c76-4e6f-96a4-72eff077f2da.png`.
- Implementation: `http://localhost:4173/`.

## Evidence

- Desktop screenshot: `qa-desktop-final.png`; viewport 1280 × 900 CSS px; browser screenshot at the same CSS viewport.
- Mobile screenshot: `qa-mobile-final.png`; viewport 390 × 844 CSS px; browser screenshot at the same CSS viewport.
- The implementation uses the resume avatar asset bundled at `src/assets/resume-avatar.jpeg`; the browser verified the image element was complete and loaded.
- The supplied gold monogram is bundled at `src/assets/zt-logo.png` and is used in both the top navigation and home brand lockup.
- No console errors were reported in the final browser pass.

## State and interactions tested

- Public home page with animated repeated typing title.
- Home title now focuses on the ZT.AI brand; the legacy two-line slogan is removed.
- The typing title loops only `ZT.AI`, holding briefly, deleting smoothly to empty, then typing again.
- Public chat page with free chat input and send action.
- MiniMax / DeepSeek model switch.
- Chat requests now flow through the local portable gateway with SSE events; provider keys remain server-side.
- Hidden media intent routing is available in the gateway without a public media page or navigation entry.
- Mobile bottom navigation between home, chat, projects, resume summary, and access pages.
- Desktop navigation between the same pages.
- Mobile page had no horizontal overflow: document width 375 CSS px at a 390 CSS px viewport.

## Fidelity review

- Fonts and typography: Manrope + Noto Sans SC for UI and DM Mono for product/system labels; mobile title wraps into two intentional lines without clipping.
- Spacing and layout rhythm: desktop uses the selected profile/chat split; mobile collapses into single-column pages with a fixed bottom navigation and safe bottom content padding.
- Colors and tokens: soft gray / white glass surfaces, graphite primary actions, muted green availability state, and locked Agent state are preserved.
- Image quality and asset fidelity: the user resume headshot is bundled and rendered in the profile and home hero; no missing-image placeholder remains.
- Copy/content: public free chat, MiniMax / DeepSeek switching, locked Agent messaging, 24-hour authorization scope, and the requested greeting are present.
- Brand/content update: supplied logo is displayed; the homepage no longer displays “把经历变成 / 可对话的证据”.

## Comparison history

1. Initial implementation: desktop home decorative orbit elements were accidentally laid out as grid children, pushing the content off-screen. Fixed by making the orbit/noise layers absolute background elements.
2. Initial mobile pass: title overflowed on narrow screens. Fixed with mobile line-break behavior and bounded title width.
3. Final pass: avatar loaded, responsive pages rendered, interactions tested, and browser console contained no errors.
4. Brand revision: replaced the Orbit placeholder mark with the supplied gold monogram, removed the two-line hero slogan, and constrained the typewriter to the repeating `ZT.AI` cycle. Final DOM check confirmed one home page, two brand placements, two logo assets, and no legacy slogan text.
5. Homepage refinement: removed the homepage avatar/access card, removed the `NOW TYPING` and intro copy from the hero, moved the typewriter onto the large `ZT.AI` wordmark, increased logo and wordmark scale, and fixed the delete timing so the wordmark visibly erases before retyping. A fresh browser tab reported no console errors.
6. Motion polish: verified the final loop in a fresh browser tab as `ZT.AI → ZT.A → ZT → empty → Z → ZT → ZT.A → ZT.AI`; the empty phase is a true empty string and the final pass reported no console errors.
7. Timing refinement: full wordmark hold measured approximately 2.11 seconds before erase begins; empty-state hold measured approximately 1.11 seconds before retyping begins; browser console remained clean.
8. Brand polish: added a restrained breathing/light-shadow animation to the supplied logo and a two-line premium manifesto with a mirrored, fading reflection beneath the lockup. Desktop and 390px mobile checks confirmed the reflection stays inside the viewport and the homepage has no avatar card or horizontal overflow.
9. Chat interaction polish: enlarged public-chat body text to 13px with 1.85 line height, added a three-dot animated thinking indicator, then streamed assistant output one character at a time. The send input/button lock during generation, auto-scroll to the newest response, and clean console were verified in a fresh chat interaction.
10. Scope revision: removed the standalone media page and all Agent/workbench/device-permission wording from the public web product. Media requests are only recognized inside the chat gateway when a user explicitly asks for an image or video.
11. Gateway pass: added portable Node gateway on the isolated local port 8790, MiniMax / DeepSeek adapter contracts, SSE chat events, env templates, rate limiting, public identity prompt, and MMX CLI adapter. Health and fallback SSE responses passed; source/build scan found no API-key-like strings.

## Findings

- No actionable P0/P1/P2 findings remain for this prototype.
- P3 follow-up: replace the temporary GitHub evidence card with live repository URLs after the user provides or authorizes the final repository list.

## Final result

passed
