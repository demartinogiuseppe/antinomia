// Antinomia — shared data interfaces and type aliases.
//
// Pure type-level declarations only: no runtime values, no imports. Extracted
// from main.ts (refactor v1.5). Settings types live in core/settings.ts; AI
// transport types (ClaudeMessage/ClaudeResponse) live in ai/callAI.ts; model
// capability types live in ai/detectModel.ts.

export interface Profile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface GraphColors {
  tensione_aperta: string;
  tensione_risolta: string;
  tensione_elevata: string;
  substrate: string;
  principio: string;
  defeated: string;
  meta_nota: string;
  label: string;
  edge: string;
  background: string;
}

export interface BackendPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  defaultKey: string;
  helpKey: string;
}

export interface TutorialStep {
  title: string;
  paragraphs: string[];
  exampleTitle?: string;
  exampleLines?: string[];
}

export interface PdfExtractResult {
  text: string;
  pageCount: number;
  truncated: boolean;
  totalChars: number;
}

export interface ClassifyResult {
  tipo: string;
  motivazione: string;
}

export interface TitleProposal {
  title: string;
}

export interface PresuppostiFields {
  presupposizioniA?: string;
  presupposizioniB?: string;
}

export interface PdfConcept {
  title: string;
  content: string;
}

export interface PdfConceptsResult {
  concepts: PdfConcept[];
}

/**
 * Carries the AI usage stats of the call that produced an analysis so the
 * downstream modal (NewTensionModal / NewSubstrateModal) can show a banner
 * with the tokens spent. Without this, the user only sees a transient
 * Notice that gets visually buried under the new modal.
 */
export interface AIUsageMeta {
  usage?: { input_tokens?: number; output_tokens?: number };
  durationMs?: number;
  profile?: string;
  model?: string;
  url?: string;
  operation?: string;
}

export interface FreeInputAnalysis {
  tipo: "tension" | "substrate";
  title: string;
  statementA: string;
  statementB: string;
  contenuto: string;
}

export type HunterConfidence = "high" | "medium" | "low";

export interface HunterContradiction {
  note_a: string;
  note_b: string;
  description: string;
  confidence?: HunterConfidence;
}

export interface HunterResult {
  pairs: HunterContradiction[];
}

export interface HunterRunMetadata {
  timestamp: string;
  notesExamined: number;
  totalCandidates: number;
  truncated: boolean;
  durationMs: number;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  dismissedFiltered: number;
}

export interface HunterRun {
  meta: HunterRunMetadata;
  result: HunterResult;
}

export interface DefeatedSubmit {
  motive: string;
  replaced_by: string | null;
}

export interface TensionFields {
  title?: string;
  statementA?: string;
  statementB?: string;
}

export interface SubstrateFields {
  title?: string;
  content?: string;
}

export interface PrincipleFields {
  ifA?: string;
  thenA?: string;
  ifB?: string;
  thenB?: string;
  greyZone?: string;
}

export interface GraphFilters {
  tensione_aperta: boolean;
  tensione_risolta: boolean;
  tensione_elevata: boolean;
  substrate: boolean;
  principle: boolean;
  defeated: boolean;
  meta_note: boolean;
}

// AI transport (wire) types. Kept here rather than in ai/callAI.ts so that
// ai/parseResponse.ts can reference ClaudeResponse without a parseResponse <->
// callAI import cycle.
export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}
