// Antinomia — plugin settings shape and defaults.
// Extracted from main.ts (refactor v1.5).

import type { Profile, GraphColors } from "./types";
import type { FrictionLevel } from "./aiFriction";

export interface AntinomiaSettings {
  profiles: Profile[];
  activeProfileId: string;
  // Empty string means "use the active profile". Otherwise overrides Hunter only.
  hunterProfileId: string;
  hunterReasoningStyle: "concise" | "verbose";
  hunterMaxNotes: number;
  hunterNoteBodyLimit: number;
  // Onboarding flags (false on first install; flipped to true by WelcomeModal)
  onboardingCompleted: boolean;
  // Tracking flags for the onboarding checklist
  hasRunHunter: boolean;
  hasUsedFreeInput: boolean;
  hasOpenedListSidebar: boolean;
  // Sidebar "first time" hints (banner dismissed once)
  hintsTensionsShown: boolean;
  hintsHunterShown: boolean;
  // Last Hunter run summary (for dashboard)
  lastHunterRunISO: string;
  lastHunterRunCount: number;
  // Human-readable name for THIS Antinomia vault (shown in sidebar headers)
  vaultDisplayName: string;
  autoOpenDashboard: boolean;
  autoOpenGraph: boolean;
  // 'transform' (legacy): cambia tipo in-place. 'split' (design C): crea P-... nuovo + converte T-... in defeated.
  elevationMode: "transform" | "split";
  // Stile grafico del Graph View. "custom" usa graphCustomColors.
  graphStyleName: string;
  graphCustomColors: GraphColors;
  // Experimental: spread nodes further apart so edges are less likely to
  // cross unrelated nodes. Slower initial layout, cleaner visual result.
  graphSpaciousLayout?: boolean;
  // Once true, the "cloud profile sends your notes to a third party" warning
  // is suppressed (user ticked "don't warn me again"). Default false.
  cloudWarningDismissed?: boolean;
  // On load, scan for legacy v1.1 (Italian schema) notes and show a one-time
  // friendly Notice offering migration. Default true.
  migrationCheckEnabled?: boolean;
  // Static galaxy-nebula background behind the Graph view. CSS-only. Default true.
  galaxyBackground?: boolean;
  // AI Friction & Model Transparency (PTM Core). How much friction every AI
  // output carries to keep the user a thinker, not a consumer. Default "medium".
  aiFrictionLevel?: FrictionLevel;
}

export const DEFAULT_SETTINGS: AntinomiaSettings = {
  profiles: [
    {
      id: "default",
      name: "Default",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      model: "claude-sonnet-4-6",
    },
  ],
  activeProfileId: "default",
  hunterProfileId: "",
  hunterReasoningStyle: "concise",
  hunterMaxNotes: 20,
  hunterNoteBodyLimit: 800,
  onboardingCompleted: false,
  hasRunHunter: false,
  hasUsedFreeInput: false,
  hasOpenedListSidebar: false,
  hintsTensionsShown: false,
  hintsHunterShown: false,
  lastHunterRunISO: "",
  lastHunterRunCount: 0,
  vaultDisplayName: "",
  autoOpenDashboard: true,
  autoOpenGraph: true,
  elevationMode: "split",
  graphStyleName: "neon",
  graphSpaciousLayout: false,
  cloudWarningDismissed: false,
  migrationCheckEnabled: true,
  galaxyBackground: true,
  aiFrictionLevel: "medium",
  graphCustomColors: {
    tensione_aperta: "#ff8c42",
    tensione_risolta: "#fbc02d",
    tensione_elevata: "#4caf50",
    substrate: "#9aa0a6",
    principio: "#2e7d32",
    defeated: "#e53935",
    meta_nota: "#7e57c2",
    label: "#999999",
    edge: "rgba(128,128,128,0.25)",
    background: "",
  },
};
