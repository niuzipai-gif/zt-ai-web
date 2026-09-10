# Adaptive explanation policy

## Source and adaptation

Inspired by the user-supplied 141.333-second video and the community project [DreambigOu/ELI5](https://github.com/DreambigOu/ELI5), specifically [revision a766623b062331fdde53467001379b4ddf3acc2f](https://github.com/DreambigOu/ELI5/tree/a766623b062331fdde53467001379b4ddf3acc2f). The repository's author affiliation and small upstream evaluation do not establish an official Anthropic feature or a performance guarantee for ZT.AI.

Useful principles: identify the intended listener, explain the essence, choose a relevant example, layer necessary detail and connect it to the listener's purpose. This implementation deliberately rejects the upstream default-to-age-five rule and permission to trade accuracy for accessibility. The upstream MIT notice is retained in `third-party/ELI5-LICENSE.txt`.

## User experience

- Normal questions: concise explanation for an ordinary adult; no new mode button needed.
- “给老板听 / to my manager / 上司向け”: decisions, impact, costs and risks.
- “专业些 / for an engineer / エンジニア向け”: precise mechanisms and trade-offs.
- “没听懂 / another example / 別の例”: change the explanation instead of repeating it. Carry the audience across a relevant follow-up; reset on a new topic.
- Ordinary chat remains natural. User-specific formatting, translation, code and tool protocols take precedence.
- Preserve accuracy, uncertainty, evidence and limitations. Do not infer the question's project from the owner's biography. No Japanese furigana unless asked.

## Integration

`server/src/explanation-style.js` is a pure local helper. It reads at most six recent user messages from the last sixteen messages, up to 2,000 characters each, and emits only constant policy text plus enumerated hints. It does not copy user text into system instructions. Tool/assistant messages and image URLs are excluded; common quoted/file markers are stripped. This is a style hint, not a security classifier or factual validator: the model still interprets the actual conversation, and the existing verification and permission layers remain authoritative.

Public web, Android's shared chat endpoint and voice transcripts use `/api/chat`. Desktop `/api/agent/chat`, Responses and Chat Completions compatibility routes use the same policy. Execution planner prompts retain their original composition. Client-provided clock values are not accepted by these routes.

No extra model call, package, voice synthesis provider, binary rebuild or browser automation is introduced. Extra prompt tokens are modest but nonzero. This does not train a model or change the cloned voice.

## Validation and limits

Run `node --test server/src/prompt-context.test.js server/src/index.explanation.test.js` for routing, format, runtime clock and real HTTP-boundary checks with a local provider fixture. Full `npm test` also includes existing search, image, voice and provider regressions.

Real-model qualitative comparison (opt-in, uses existing provider quota):

```powershell
node --env-file=<private-env-file> --use-env-proxy tools/evaluate-explanations.mjs output/explanation-evaluation
```

Use a fresh output directory per run. The runner saves only fixed test cases, visible answers and timings, never keys. It uses identical supplied facts for before/after variants and does not claim to test web search or TTS. There is no automatic “quality score”: read the answers for actual audience fit, incorrect generalizations, invented assumptions, language and length. Model outputs remain stochastic; failures cannot be hidden behind a green unit-test count.
