// Antinomia — AI response parsing helpers.
// Extracted from main.ts (refactor v1.5).

import type {
  ClaudeResponse,
  TitleProposal,
  FreeInputAnalysis,
  HunterContradiction,
  HunterConfidence,
  PresuppositionProposal,
  AICompletionResponse,
  AIAnthropicResponse,
} from "../core/types";

/**
 * Parse the AI "map presuppositions" response into proposals. Accepts a bare
 * JSON array or a `{ presuppositions: [...] }` wrapper, tolerating prose around
 * it (via extractJson). Returns null if nothing usable.
 */
export function parsePresuppositionsFromAIResponse(
  rawText: string
): PresuppositionProposal[] | null {
  if (!rawText || !rawText.trim()) return null;
  const parsed = extractJson<unknown>(rawText);
  if (!parsed) return null;
  const wrapped = parsed as { presuppositions?: unknown };
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(wrapped.presuppositions)
      ? wrapped.presuppositions
      : [];
  if (arr.length === 0) return null;
  const out: PresuppositionProposal[] = [];
  for (const raw of arr) {
    const item = raw as {
      text?: unknown;
      confidence?: unknown;
      similar_existing?: unknown;
    };
    const text = String(item.text ?? "").trim();
    if (!text) continue;
    const rawConf = String(item.confidence ?? "").toLowerCase().trim();
    const confidence: "high" | "medium" | "low" =
      rawConf === "high" || rawConf === "low" ? rawConf : "medium";
    const sim = item.similar_existing;
    const similar_existing =
      typeof sim === "string" && sim.trim() && sim.toLowerCase() !== "null"
        ? sim.trim()
        : null;
    out.push({ text, confidence, similar_existing });
  }
  return out.length > 0 ? out : null;
}

/**
 * Normalize one raw Hunter pair object into a HunterContradiction. Accepts the
 * current English schema (note_a/note_b/description/confidence high|medium|low)
 * and the legacy Italian schema (nota_a/nota_b/descrizione/alta|media|bassa)
 * for backward-compat. Missing fields become empty strings / undefined
 * confidence. Extracted from runHunter so it can be unit-tested.
 */
export function normalizeHunterPair(c: unknown): HunterContradiction {
  const o = (c ?? {}) as {
    note_a?: unknown; nota_a?: unknown;
    note_b?: unknown; nota_b?: unknown;
    description?: unknown; descrizione?: unknown;
    confidence?: unknown;
  };
  return {
    note_a: String(o.note_a ?? o.nota_a ?? ""),
    note_b: String(o.note_b ?? o.nota_b ?? ""),
    description: String(o.description ?? o.descrizione ?? ""),
    confidence: ((): HunterConfidence | undefined => {
      const raw = String(o.confidence ?? "").toLowerCase().trim();
      if (raw === "high" || raw === "medium" || raw === "low")
        return raw;
      if (raw === "alta") return "high";
      if (raw === "media") return "medium";
      if (raw === "bassa") return "low";
      return undefined;
    })(),
  };
}

export function normalizeJsonQuotes(s: string): string {
  // First pass: tokenize to know when we are inside a double-quoted string.
  let out = "";
  let i = 0;
  const len = s.length;
  while (i < len) {
    const ch = s[i];
    if (ch === '"') {
      // Copy the whole double-quoted string verbatim (respecting backslash escapes)
      out += ch;
      i++;
      while (i < len) {
        const c2 = s[i];
        out += c2;
        if (c2 === "\\" && i + 1 < len) {
          out += s[i + 1];
          i += 2;
          continue;
        }
        i++;
        if (c2 === '"') break;
      }
      continue;
    }
    // Check if we are at a "value-start" position followed by a single-quoted string
    if (ch === "'") {
      // Look back for last non-whitespace char to confirm value position
      let j = out.length - 1;
      while (j >= 0 && /\s/.test(out[j])) j--;
      const prev = j >= 0 ? out[j] : "";
      if (prev === ":" || prev === "[" || prev === ",") {
        // Consume single-quoted string
        i++;
        let inner = "";
        while (i < len) {
          const c2 = s[i];
          if (c2 === "\\" && i + 1 < len) {
            const next = s[i + 1];
            // Unescape \' -> ', keep other escapes
            if (next === "'") {
              inner += "'";
            } else {
              inner += "\\" + next;
            }
            i += 2;
            continue;
          }
          if (c2 === "'") {
            i++;
            break;
          }
          inner += c2;
          i++;
        }
        // Escape double quotes and newlines in the captured string
        inner = inner
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r");
        out += '"' + inner + '"';
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

export function extractJson<T>(raw: string): T | null {
  // Pass 0: try ALL `{` positions in the raw text and return the first one
  // that parses as a JSON object. Some models (e.g. Qwen3) emit JS code with
  // braces BEFORE the real JSON answer, which fools brace-matching parsers.
  const tryAllCandidates = (raw: string): T | null => {
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== "{" && raw[i] !== "[") continue;
      // brace match
      const open = raw[i];
      const close = open === "{" ? "}" : "]";
      let depth = 0;
      let inStr = false;
      let strCh = "";
      let esc = false;
      for (let j = i; j < raw.length; j++) {
        const c = raw[j];
        if (inStr) {
          if (esc) { esc = false; continue; }
          if (c === "\\") { esc = true; continue; }
          if (c === strCh) { inStr = false; continue; }
          continue;
        }
        if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
        if (c === open) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) {
            const slice = raw.slice(i, j + 1);
            try {
              const parsed = JSON.parse(slice) as unknown;
              if (parsed && typeof parsed === "object") return parsed as T;
            } catch {
              // try with quote normalization
              try {
                const normalized = slice
                  .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'(\s*[:,}\]])/g, '"$1"$2')
                  .replace(/([:,\[]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'/g, '$1"$2"')
                  .replace(/,(\s*[}\]])/g, "$1");
                const parsed2 = JSON.parse(normalized) as unknown;
                if (parsed2 && typeof parsed2 === "object") return parsed2 as T;
              } catch {
                /* keep scanning */
              }
            }
            break;
          }
        }
      }
    }
    return null;
  };
  // Strip <thinking>...</thinking> blocks (R1-style "high reasoning" models).
  let text = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // Pass 0: try ALL `{` positions in the (cleaned) text.
  const allCands = tryAllCandidates(text);
  if (allCands !== null) return allCands;

  // Prefer fenced ```json``` blocks if present.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : text;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);

  // 1) Strict JSON.parse
  try {
    return JSON.parse(slice) as T;
  } catch {
    // fall through
  }

  // 2) Lenient: strip // line comments + trailing commas
  const cleaned = slice
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through
  }

  // 3) Most lenient: normalize single-quoted string values to double-quoted
  const normalized = normalizeJsonQuotes(cleaned);
  try {
    return JSON.parse(normalized) as T;
  } catch (e) {
    console.error("[Antinomia] extractJson exhausted attempts. Last error:", e);
    console.error("[Antinomia] Normalized text was:", normalized);
    return null;
  }
}

export function parseAIResponse(
  data: unknown,
  apiFormat: "anthropic" | "openai"
): { text: string; usage?: ClaudeResponse["usage"] } {
  const d = (data ?? {}) as AICompletionResponse & AIAnthropicResponse;
  if (apiFormat === "anthropic") {
    const text = (d.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("\n");
    return { text, usage: d.usage as ClaudeResponse["usage"] };
  }
  // OpenAI-compatible
  const msg = d.choices?.[0]?.message ?? {};
  const primary = msg.content ?? d.choices?.[0]?.text ?? "";

  // FALLBACK for reasoning models that put their output in `reasoning_content`
  // (Qwen3 distills via LM Studio, DeepSeek-R1, some Ollama models). If they
  // hit max_tokens mid-thinking, `content` is "" but `reasoning_content` holds
  // the entire chain-of-thought — and the final answer is usually written in
  // the last lines. We surface it as `text` so the downstream parsers
  // (parseTitleFromAIResponse etc.) can fish out a JSON or pattern.
  const reasoning =
    msg.reasoning_content ??
    msg.reasoning ??
    d.choices?.[0]?.reasoning_content ??
    "";

  let text: string = primary;
  if ((!primary || !String(primary).trim()) && reasoning && String(reasoning).trim()) {
    text = String(reasoning);
    console.warn(
      "[Antinomia] AI content empty — falling back to reasoning_content (" +
        text.length +
        " chars). Likely a reasoning model truncated by max_tokens."
    );
  }

  const finishReason = d.choices?.[0]?.finish_reason;
  if (finishReason === "length") {
    console.warn(
      "[Antinomia] AI finish_reason=length — response was truncated. Raise max_tokens."
    );
  }

  const usage = d.usage
    ? {
        input_tokens: d.usage.prompt_tokens ?? 0,
        output_tokens: d.usage.completion_tokens ?? 0,
      }
    : undefined;
  return { text, usage };
}

export function parseTitleFromAIResponse(rawText: string): string | null {
  if (!rawText || !rawText.trim()) return null;

  const sanitizeTitle = (raw: string): string => {
    let t = raw.trim();
    // Strip surrounding quotes/backticks (ASCII + smart quotes)
    t = t.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
    // Strip surrounding markdown bold/italic
    t = t.replace(/^[*_]+|[*_]+$/g, "").trim();
    // If multi-sentence, keep only the first sentence
    const m = t.match(/^[^.!?\n]+/);
    if (m) t = m[0].trim();
    // Cap at 7 words
    const words = t.split(/\s+/);
    if (words.length > 7) t = words.slice(0, 7).join(" ");
    // Cap at 60 chars (word boundary if possible)
    if (t.length > 60) {
      const cut = t.slice(0, 60);
      const lastSpace = cut.lastIndexOf(" ");
      t = lastSpace > 30 ? cut.slice(0, lastSpace) : cut;
    }
    // Strip trailing punctuation/quotes
    t = t.replace(/[.,;:\-—_"'`]+$/, "").trim();
    return t;
  };

  // Pre-clean: strip thinking blocks, code fences, markdown emphasis
  const cleaned = rawText
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // Open <think> with no close: drop everything up to a heuristic end
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/```[a-zA-Z]*\n?|```/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .trim();

  if (!cleaned) return null;

  // Pattern 1: strict JSON with "title" key
  try {
    const parsed = extractJson<TitleProposal>(cleaned);
    if (parsed && typeof parsed.title === "string" && parsed.title.trim()) {
      const t = sanitizeTitle(parsed.title);
      if (t.length > 0) return t;
    }
  } catch {
    /* fall through */
  }

  // Pattern 2: loose `"title": "..."` anywhere
  const jsonLike = cleaned.match(/["']title["']\s*:\s*["']([^"'\n]{1,200})["']/i);
  if (jsonLike) {
    const t = sanitizeTitle(jsonLike[1]);
    if (t.length > 0) return t;
  }

  // Pattern 3: `Title:` / `Titolo:` label line
  const labeled = cleaned.match(
    /(?:^|\n)\s*(?:title|titolo|proposed title|titolo proposto)\s*[:\-—]\s*(.+?)(?:\n|$)/i
  );
  if (labeled) {
    const t = sanitizeTitle(labeled[1]);
    if (t.length > 0) return t;
  }

  // Pattern 4: any quoted string of reasonable length (ASCII + smart quotes)
  const quoted = cleaned.match(/["“]([^"”\n]{4,80})["”]/);
  if (quoted) {
    const t = sanitizeTitle(quoted[1]);
    if (t.length > 0) return t;
  }

  // Pattern 5: skip reasoning/preamble lines, pick first short line.
  const skipPatterns =
    /^(l'utente|the user|i (think|believe|will|need|should)|let me|here(?:'s| is)|ecco|allora|sto|so |okay|the goal|my task|to (propose|generate|create)|reasoning:|note:|output:|response:|json:)/i;
  // Blacklist: lines that talk ABOUT the title/format instead of being one.
  // A reasoning model that ignores the JSON-only instruction often leaks a
  // fragment like "as a JSON object with one title field" — short enough to
  // pass the length test, but obviously meta. Reject and try the next line.
  //
  // Matched on meta-instruction SHAPES, not bare nouns: words like "value",
  // "object", "string", "key" appear in legitimate titles ("The value of
  // doubt", "Object of desire") and must NOT be rejected.
  //   reject: "as a JSON object with one title"  ·  "the title field is a string"
  //           "format: key value pairs"          ·  "with one title field"
  //   keep:   "The value of doubt"               ·  "Object of desire"
  //           "Truth as a weapon"                ·  "Speed or correctness"
  const metaBlacklist =
    /\bjson\b|\btitle field\b|\bschema\b|\bas a (json|string|title|object|field)\b|\bwith one (title|field|object)\b|\b(field|format|key|value|property)\s*[:=]/i;
  const lines = cleaned
    .split("\n")
    .map((s) => s.trim())
    .filter(
      (s) => s.length > 0 && !skipPatterns.test(s) && !metaBlacklist.test(s)
    );
  const shortLine = lines.find((s) => s.length <= 80 && s.split(/\s+/).length <= 10);
  const candidate = shortLine || lines[0];
  if (candidate) {
    const stripped = candidate.replace(/^(title|titolo)[:\s\-—]+/i, "").trim();
    // Final guard: even after stripping, bail if the candidate is meta-content.
    if (!metaBlacklist.test(stripped)) {
      const t = sanitizeTitle(stripped);
      if (t.length > 0) return t;
    }
  }

  return null;
}

/**
 * Parse a Free-input analysis ({tipo, title, statementA, statementB,
 * contenuto}) out of an AI response, tolerating prose. Mirrors the
 * fallback ladder of parseTitleFromAIResponse:
 *   1. strict JSON (extractJson)
 *   2. loose JSON-ish field extraction ("tipo": "...", "title": "...", ...)
 *   3. discursive heuristic (a reasoning model narrating its choice)
 * Returns null only when even `tipo` can't be determined.
 *
 * Real failure this rescues (qwen3-distill):
 *   "...I'll classify this as a 'substrate'... The title could be something
 *    like 'Financial Documentation Requirements'. Since this is a substrate,
 *    I won't fill in the statementA and statementB fields."
 *   -> { tipo: "substrate", title: "Financial Documentation Requirements", ... }
 */
export function parseFreeInputFromAIResponse(
  rawText: string
): FreeInputAnalysis | null {
  if (!rawText || !rawText.trim()) return null;
  const clean = rawText
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
  if (!clean) return null;

  const mk = (
    tipo: "tension" | "substrate",
    title: string,
    statementA = "",
    statementB = "",
    contenuto = ""
  ): FreeInputAnalysis => ({
    tipo,
    title: title.trim(),
    statementA: statementA.trim(),
    statementB: statementB.trim(),
    contenuto: contenuto.trim(),
  });

  // Pattern 1: strict JSON.
  try {
    const j = extractJson<Record<string, unknown>>(clean);
    if (j && (j.tipo === "tension" || j.tipo === "substrate")) {
      return mk(
        j.tipo,
        String(j.title ?? ""),
        String(j.statementA ?? ""),
        String(j.statementB ?? ""),
        String(j.contenuto ?? j.content ?? "")
      );
    }
  } catch {
    /* fall through */
  }

  // Determine tipo: loose JSON field, then prose phrasings, then last-resort
  // first bare mention.
  const tipoMatch =
    clean.match(/["']?tipo["']?\s*[:=]\s*["']?(substrate|tension)\b/i) ||
    clean.match(
      /classif\w*\s+(?:it|this)?\s*(?:as|come)\s*(?:a|an|un[ao]?)?\s*["']?(substrate|tension)\b/i
    ) ||
    clean.match(/\bthis is (?:a|an)\s+(substrate|tension)\b/i) ||
    clean.match(/\b(substrate|tension)\b/i);
  if (!tipoMatch) return null;
  const tipo = tipoMatch[1].toLowerCase() as "tension" | "substrate";

  // Title: JSON-ish "title": "X", then prose "title ... 'X'". Do NOT fall back
  // to the first quoted string (that is usually the tipo word, e.g. 'substrate').
  const field = (re: RegExp): string => {
    const m = clean.match(re);
    return m ? m[1].trim() : "";
  };
  const title =
    field(/["']?title["']?\s*[:=]\s*["']([^"'\n]{2,100})["']/i) ||
    field(/["']?title["']?\s*[:=]\s*([^\n,}"']{2,100})/i) ||
    field(/\btitle\b[^"'\n]{0,40}["']([^"'\n]{2,100})["']/i);

  const statementA =
    field(/["']?statementA["']?\s*[:=]\s*["']([^"'\n]{1,300})["']/i) ||
    field(/statement\s*A\s*[:=]\s*([^\n]{1,300})/i);
  const statementB =
    field(/["']?statementB["']?\s*[:=]\s*["']([^"'\n]{1,300})["']/i) ||
    field(/statement\s*B\s*[:=]\s*([^\n]{1,300})/i);
  const contenuto =
    field(/["']?(?:contenuto|content)["']?\s*[:=]\s*["']([^"'\n]{1,500})["']/i) ||
    field(/\b(?:contenuto|content)\s*[:=]\s*([^\n]{1,500})/i);

  return mk(tipo, title, statementA, statementB, contenuto);
}
