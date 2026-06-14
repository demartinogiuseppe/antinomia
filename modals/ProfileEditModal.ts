// Antinomia — edit-AI-profile modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting } from "obsidian";
import { BACKEND_PRESETS, MODEL_PRESETS, detectBackend } from "../core/constants";
import type { Profile } from "../core/types";

export class ProfileEditModal extends Modal {
  private current: Profile;
  constructor(
    app: App,
    initialProfile: Profile,
    private onSubmit: (saved: Profile | null) => void | Promise<void>
  ) {
    super(app);
    // shallow clone so we don't mutate the original until saved
    this.current = { ...initialProfile };
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Edit AI profile" });

    const profile = this.current;

    new Setting(contentEl)
      .setName("Backend preset")
      .setDesc("Pre-fills base URL + suggested model.")
      .addDropdown((dd) => {
        for (const p of BACKEND_PRESETS) dd.addOption(p.id, p.label);
        dd.addOption("custom", "Custom / other");
        dd.setValue(detectBackend(profile.baseUrl));
        dd.onChange((presetId) => {
          const preset = BACKEND_PRESETS.find((p) => p.id === presetId);
          if (preset) {
            profile.baseUrl = preset.baseUrl;
            profile.model = preset.defaultModel;
            if (preset.defaultKey && !profile.apiKey) {
              profile.apiKey = preset.defaultKey;
            }
            this.refresh();
          }
        });
      });

    new Setting(contentEl).setName("Name").addText((text) =>
      text
        .setPlaceholder("E.g. Sonnet Cloud, Qwen 14B local, ...")
        .setValue(profile.name)
        .onChange((v) => (profile.name = v))
    );

    new Setting(contentEl).setName("Base URL").addText((text) =>
      text
        .setPlaceholder("https://api.anthropic.com")
        .setValue(profile.baseUrl)
        .onChange(
          (v) => (profile.baseUrl = v.trim().replace(/\/$/, "") || profile.baseUrl)
        )
    );

    new Setting(contentEl).setName("API key").addText((text) =>
      text
        .setPlaceholder("sk-ant-... or lmstudio")
        .setValue(profile.apiKey)
        .onChange((v) => (profile.apiKey = v.trim()))
    );

    new Setting(contentEl)
      .setName("Model")
      .addDropdown((dd) => {
        for (const m of MODEL_PRESETS) dd.addOption(m.id, m.label);
        if (!MODEL_PRESETS.some((m) => m.id === profile.model)) {
          dd.addOption(profile.model, profile.model);
        }
        dd.setValue(profile.model);
        dd.onChange((v) => (profile.model = v));
      });

    new Setting(contentEl)
      .setName("Custom model")
      .setDesc("Free-form string (overrides dropdown). Empty = use dropdown.")
      .addText((text) =>
        text
          .setPlaceholder("exact-model-name")
          .setValue(profile.model)
          .onChange((v) => {
            const t = v.trim();
            if (t) profile.model = t;
          })
      );

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          void this.onSubmit(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            void this.onSubmit(this.current);
            this.close();
          })
      );
  }
  refresh(): void {
    // simple way: close + reopen with updated state
    this.contentEl.empty();
    this.onOpen();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
