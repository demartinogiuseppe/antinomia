# Antinomia test suite (Vitest)

Unit tests for the **pure** parts of the plugin — the functions that classify
models, parse AI responses, and format frontmatter. Modal/View classes that
need the live Obsidian runtime are intentionally **not** tested here (high
mocking cost, low ROL); coverage focuses on `core/` and `ai/`.

## Running

```bash
cd plugin
npm test            # one-shot run (vitest run)
npm run test:watch  # re-run on change
npm run test:coverage  # run + coverage report (text + html in coverage/)
```

## Layout

```
tests/
├── mocks/obsidian.ts   # stub for the "obsidian" module (real moment.js, stub classes)
├── fixtures/ai-responses/   # captured real AI responses per model family
├── core/               # utils.ts, frontmatter.ts
├── ai/                 # parseResponse.ts, detectModel.ts, hunter normalizePair
└── setup.test.ts       # pipeline smoke test
```

## How "obsidian" is mocked

The real `obsidian` module only exists inside the app. `vitest.config.ts`
aliases `obsidian` to `tests/mocks/obsidian.ts`, which re-exports the genuine
`moment` (so date formatters produce real output) and provides lightweight
stub classes for the rest — they are only referenced as types / constructor
params by the functions under test.

For a one-off mock inside a single test, `vi.mock("obsidian", () => ({...}))`
also works.

## Fixtures

`fixtures/ai-responses/*.json` are real (or realistic) backend responses per
family — Anthropic content arrays, OpenAI strings, Qwen3-distill
`reasoning_content` fallbacks, prose-instead-of-JSON failures, etc. Tests load
them with `readFileSync` and assert the parsers handle each shape. They double
as regression anchors for the bugs they reproduce (BUG-009/010/011, 160, 161,
CLOUD-001).
