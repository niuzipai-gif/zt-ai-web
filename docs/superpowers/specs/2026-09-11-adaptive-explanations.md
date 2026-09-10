# Adaptive explanations — approved design

User approved automatic adaptation on 2026-09-11 after reviewing the alternative of manual-only activation.

## Outcome

ZT.AI explains difficult topics clearly without turning casual conversation into a lesson. Default audience is an ordinary adult, not a five-year-old. Explicit audience, depth, and follow-up preferences take precedence. Chinese, English, Japanese, public voice, and desktop gateway responses share this policy.

## Implementation boundaries

- One bounded, local policy resolver; no additional model requests or new dependency.
- Explain the essence first; add an appropriate example only when useful; connect it to the actual mechanism and preserve limitations.
- Business audiences get decisions, benefits, costs, risks; technical audiences retain terminology and trade-offs. Never fabricate metrics for persuasion.
- Recent user instructions can guide follow-up explanations. Never promote attachment, assistant, or tool text to a system instruction.
- Casual conversation stays natural. Strict output formats, translations, tool calls, and execution plans retain priority. Planner prompt is unchanged.
- Keep current search verification, runtime clock, persona, language rules, Japanese no-furigana policy, and speech pipeline intact.
- Do not change resumes, project animations, voice models, client installers, or credentials.

## Evidence

Video: local 141.333-second clip supplied by user; sampled frames plus full timestamped local ASR, with recognition errors cross-checked against source.
Community source: DreambigOu/ELI5, revision a766623b062331fdde53467001379b4ddf3acc2f, MIT. Not verified as an official Anthropic project. Adapt principles, not its child-default or permission to sacrifice accuracy. No upstream performance claims transferred to ZT.AI.

## Acceptance

Automated tests cover multilingual instructions, follow-ups, reset on topic changes, strict format isolation, untrusted-content boundaries, and shared gateway entry points. Bounded real-model comparisons are reviewed for clarity and factual caveats, with failures reported. Deployment is complete only when the serving backend revision is verified.
