// continuous-physics knowledge graph view (cytoscape + edge overlay). Extracted from main.ts (refactor v1.5).

import cytoscape from "cytoscape";
import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { DEFAULT_GRAPH_FILTERS, GRAPH_STYLE_PRESETS, LAYER_COLORS, LAYER_SHAPES, VIEW_TYPE_GRAPH } from "../core/constants";
import { humanTitle, layerKey, readFrontmatter } from "../core/frontmatter";
import type { GraphColors, GraphFilters } from "../core/types";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { hoverBus, type HoverPayload } from "../core/hoverBus";

export class AntinomiaGraphView extends ItemView {
  plugin: AntinomiaPlugin;
  filters: GraphFilters = { ...DEFAULT_GRAPH_FILTERS };
  layoutName = "clusters";
  cy: cytoscape.Core | null = null;
  graphContainer: HTMLElement | null = null;
  // Parallax background layers (3D galaxy effect). Null when the galaxy
  // background setting is off.
  private galaxyLayer: HTMLElement | null = null;
  private starsLayer: HTMLElement | null = null;
  // Unsubscribe handle for the cross-pane hover bus (set in onOpen).
  private hoverUnsub: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_GRAPH;
  }
  getDisplayText(): string {
    return "Antinomia Graph";
  }
  getIcon(): string {
    return "git-fork";
  }

  async onOpen(): Promise<void> {
    this.render();
    // Refresh when vault changes
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.scheduleRefresh())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.scheduleRefresh())
    );
    this.registerEvent(
      this.app.vault.on("rename", () => this.scheduleRefresh())
    );

    // Cross-pane hover: react to hovers originating elsewhere (file explorer,
    // Antinomia sidebars, backlinks). Events we emit ourselves carry
    // source "graph" and are skipped — that's the loop guard.
    this.hoverUnsub = hoverBus.on((ev, p: HoverPayload) => {
      // Defensive: skip own events + bail if cy is gone (view closing/closed).
      // try/catch covers a Cytoscape edge case where internal hover-tracking
      // (findNearestElements → boundingBox → headless) accesses a node whose
      // `_private.cy` is null right after a node removal during rebuildGraph.
      if (p.source === "graph" || !this.cy) return;
      try {
        const node = this.cy.getElementById(p.basename);
        if (!node || node.empty()) return;
        if (ev === "enter") {
          node.addClass("hover-focus");
          node.openNeighborhood().nodes().addClass("hover-neighbor");
        } else {
          this.cy.elements().removeClass("hover-focus hover-neighbor");
        }
      } catch (e) {
        console.debug("[Antinomia] hover-bus subscriber swallowed:", e);
      }
    });
  }

  private refreshTimer: number | null = null;
  private scheduleRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.rebuildGraph();
    }, 400);
  }

  async onClose(): Promise<void> {
    this.stopContinuousPhysics();
    if (this.hoverUnsub) {
      this.hoverUnsub();
      this.hoverUnsub = null;
    }
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }

  render(): void {
    const { contentEl } = this;
    contentEl.empty();
    renderAntinomiaNav(this.plugin, contentEl, this.leaf);
    contentEl.setCssStyles({
      padding: "0",
      display: "flex",
      flexDirection: "column",
      height: "100%",
    });
    contentEl.setCssStyles({ overflow: "hidden" }); // niente scrollbar lampeggiante quando i nodi fluttuano
    // Anche il parent .view-content puo' avere overflow:auto di default
    const viewContent = contentEl.closest(".view-content") as HTMLElement | null;
    if (viewContent) viewContent.setCssStyles({ overflow: "hidden" });

    // Toolbar
    const toolbar = contentEl.createDiv();
    toolbar.setCssStyles({
      padding: "8px 12px",
      borderBottom: "1px solid var(--background-modifier-border)",
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      alignItems: "center",
    });

    const label = toolbar.createSpan({ text: "Antinomia Graph" });
    label.setCssStyles({
      fontWeight: "bold",
      marginRight: "12px",
    });

    const mkChk = (
      key: keyof GraphFilters,
      txt: string,
      colorKey: string
    ): void => {
      const wrap = toolbar.createSpan();
      wrap.setCssStyles({
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 6px",
        borderRadius: "4px",
        background: "var(--background-secondary)",
      });
      const cb = wrap.createEl("input", { type: "checkbox" });
      cb.checked = this.filters[key];
      cb.id = `cb-${String(key)}`;
      const dot = wrap.createSpan();
      dot.setCssStyles({
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        background: this.activeLayerColor(colorKey),
        display: "inline-block",
      });
      const lab = wrap.createEl("label", { text: txt });
      lab.htmlFor = cb.id;
      lab.setCssStyles({
        fontSize: "0.85em",
        cursor: "pointer",
      });
      cb.onchange = () => {
        this.filters[key] = cb.checked;
        this.rebuildGraph();
        // rebuildGraph() now adds new nodes at layer-specific positions
        // (not at (0,0)) and the existing continuous physics simulation
        // integrates them naturally. No full fcose re-layout — that was
        // causing the "pallini swarm to center then expand" effect because
        // fcose internally repositions all nodes when run with animation.
        this.startContinuousPhysics();
        // Run edge-node repulsion immediately to push nodes off the new
        // edges. Then a second pass after the physics has briefly settled
        // to clean up any residual overlaps the physics may have re-created.
        // Physics keeps running so movement stays smooth (no freeze).
        try {
          this.applyEdgeNodeRepulsion();
        } catch {
          /* ignore */
        }
        window.setTimeout(() => {
          try {
            this.applyEdgeNodeRepulsion();
          } catch {
            /* ignore */
          }
        }, 600);
      };
    };

    mkChk("tensione_aperta", "Open tensions", "tensione_aperta");
    mkChk("tensione_risolta", "Resolved", "tensione_risolta");
    mkChk("tensione_elevata", "Elevated", "tensione_elevata");
    mkChk("substrate", "Substrate", "substrate");
    mkChk("principle", "Principles", "principle");
    mkChk("defeated", "Defeated", "defeated");
    mkChk("meta_note", "Meta", "meta_note");
    mkChk("presupposition", "Presuppositions", "presupposition");

    // Spacer
    const spacer = toolbar.createDiv();
    spacer.setCssStyles({ flex: "1" });

    // Layout dropdown
    const layoutSel = toolbar.createEl("select");
    layoutSel.setCssStyles({ padding: "2px 4px" });
    [
      ["clusters", "Clusters by layer"],
      ["fcose", "Force-directed (free)"],
      ["concentric", "Concentric"],
      ["grid", "Grid"],
      ["circle", "Circle"],
      ["breadthfirst", "Tree"],
    ].forEach(([v, t]) => {
      const opt = layoutSel.createEl("option", { value: v, text: t });
      if (v === this.layoutName) opt.selected = true;
    });
    layoutSel.onchange = () => {
      this.layoutName = layoutSel.value;
      this.applyLayout();
    };

    const fitBtn = toolbar.createEl("button", { text: "Fit" });
    fitBtn.onclick = () => this.cy?.fit(undefined, 40);

    const resetBtn = toolbar.createEl("button", { text: "Reset filters" });
    resetBtn.onclick = () => {
      this.filters = { ...DEFAULT_GRAPH_FILTERS };
      this.render();
    };

    // Graph container
    const container = contentEl.createDiv();
    container.setCssStyles({ flex: "1" });
    container.setCssStyles({ minHeight: "0" }); // permette al flex item di restringersi
    // backgroundColor is the base shown when the galaxy background is off.
    container.setCssStyles({
      backgroundColor: "var(--background-primary)",
      overflow: "hidden",
      position: "relative",
    });
    // isolation:isolate makes the container a stacking context so the parallax
    // background layers (negative z-index) stay contained above its base colour
    // and strictly below the graph content (edge SVG, canvases, label SVG).
    container.setCssStyles({ isolation: "isolate" });
    this.graphContainer = container;
    this.applyGalaxyClass();

    // Zoom slider verticale: figlio di contentEl (NON di container) cosi'
    // non viene coperto dai canvas Cytoscape che vivono dentro container.
    // Posizionato assoluto rispetto a contentEl con riferimento al container.
    const sliderWrap = contentEl.createDiv();
    sliderWrap.setCssStyles({
      position: "absolute",
      right: "18px",
      top: "50%",
      transform: "translateY(-50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "6px",
      background: "var(--background-secondary)",
      padding: "8px 6px",
      borderRadius: "6px",
      zIndex: "9999",
      pointerEvents: "auto",
      opacity: "0.9",
    });
    const plusBtn = sliderWrap.createEl("button", { text: "+" });
    plusBtn.setCssStyles({
      width: "24px",
      height: "24px",
      padding: "0",
      cursor: "pointer",
      fontWeight: "bold",
    });
    const slider = sliderWrap.createEl("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = "50";
    // Vertical slider: the legacy `appearance: slider-vertical` keyword is
    // deprecated in Chromium. Use the standard alternative (vertical
    // writing-mode + RTL direction) which works in all current browsers.
    slider.setCssStyles({
      writingMode: "vertical-lr",
      direction: "rtl",
      width: "8px",
      height: "160px",
      cursor: "pointer",
      pointerEvents: "auto",
    });
    (slider as unknown as { orient?: string }).orient = "vertical";
    const minusBtn = sliderWrap.createEl("button", { text: "−" });
    minusBtn.setCssStyles({
      width: "24px",
      height: "24px",
      padding: "0",
      cursor: "pointer",
      fontWeight: "bold",
    });

    // Conversione: slider 0-100 <-> zoom 0.02-8 (log scale)
    const LN_MIN = Math.log(0.02);
    const LN_MAX = Math.log(8);
    const sliderToZoom = (v: number): number =>
      Math.exp(LN_MIN + (v / 100) * (LN_MAX - LN_MIN));
    const zoomToSlider = (z: number): number =>
      ((Math.log(z) - LN_MIN) / (LN_MAX - LN_MIN)) * 100;

    const applySliderZoom = (val: number): void => {
      if (!this.cy) return;
      const newZoom = sliderToZoom(val);
      // Centra sul centro viewport (non sul cursore)
      const w = this.cy.width();
      const h = this.cy.height();
      this.cy.stop(true, false);
      this.cy.animate({
        zoom: { level: newZoom, renderedPosition: { x: w / 2, y: h / 2 } },
        duration: 180,
        easing: "ease-out",
        queue: false,
      });
    };

    slider.addEventListener("input", () => {
      applySliderZoom(parseFloat(slider.value));
    });
    plusBtn.onclick = () => {
      const newVal = Math.min(100, parseFloat(slider.value) + 6);
      slider.value = String(newVal);
      applySliderZoom(newVal);
    };
    minusBtn.onclick = () => {
      const newVal = Math.max(0, parseFloat(slider.value) - 6);
      slider.value = String(newVal);
      applySliderZoom(newVal);
    };

    // Sync slider quando l'utente usa la rotella
    const updateSliderFromCy = (): void => {
      if (!this.cy) return;
      const v = Math.max(0, Math.min(100, zoomToSlider(this.cy.zoom())));
      slider.value = String(v);
    };
    // Wait per cy creato, poi aggancia listener
    window.setTimeout(() => {
      if (this.cy) {
        this.cy.on("zoom", updateSliderFromCy);
        updateSliderFromCy();
      }
    }, 200);

    // Wait one tick so container has dimensions
    window.setTimeout(() => this.rebuildGraph(), 50);
  }

  private collectGraphData(): { nodes: cytoscape.ElementDefinition[]; edges: cytoscape.ElementDefinition[] } {
    const nodes: cytoscape.ElementDefinition[] = [];
    const edges: cytoscape.ElementDefinition[] = [];
    const seenEdges = new Set<string>();
    const includedBasenames = new Set<string>();

    // layerKey lives in core/frontmatter (shared + unit-tested).

    const colorKey = (key: keyof GraphFilters): string => {
      // Identity mapping (kept as a function for potential future remapping).
      return String(key);
    };

    const allFiles = this.app.vault.getMarkdownFiles();
    const fileByBasename = new Map<string, TFile>();
    for (const f of allFiles) fileByBasename.set(f.basename, f);

    // Pass 1: nodes
    for (const f of allFiles) {
      const fm = readFrontmatter(this.app, f);
      const key = layerKey(fm);
      if (!key) continue;
      if (!this.filters[key]) continue;
      includedBasenames.add(f.basename);
      const title = humanTitle(this.app, f);
      const ck = colorKey(key);
      // Tronca a 22 char per leggibilita'; full title resta nei tooltip
      const shortLabel =
        title.length > 22 ? title.slice(0, 20).trimEnd() + "..." : title;
      const nodeColor = this.activeLayerColor(ck);
      nodes.push({
        data: {
          id: f.basename,
          path: f.path,
          label: shortLabel,
          fullTitle: title,
          layer: key,
          color: nodeColor,
          shape: LAYER_SHAPES[ck] || "ellipse",
          glow: this.glowSvgDataUri(nodeColor),
          glowBright: this.glowSvgDataUri(nodeColor, true),
        },
      });
    }

    // Pass 2: edges from frontmatter + body wikilinks
    const addEdge = (src: string, tgt: string, kind: string): void => {
      if (!src || !tgt) return;
      if (src === tgt) return; // skip self-loops
      if (!includedBasenames.has(src) || !includedBasenames.has(tgt)) return;
      const key = `${src}->${tgt}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      // ID semantico stabile cosi' il diff funziona tra rebuild consecutivi.
      edges.push({
        data: { id: `e-${src}-${kind}->${tgt}`, source: src, target: tgt, kind },
      });
    };

    const extractBasenameFromWikilink = (raw: unknown): string | null => {
      if (typeof raw !== "string") return null;
      const m = raw.match(/\[\[([^\]|#]+)/);
      if (!m) return null;
      // could be "T-foo" or a full path "notes/T-foo"; take the last segment
      const last = m[1].split("/").pop() || m[1];
      return last.trim();
    };

    for (const f of allFiles) {
      if (!includedBasenames.has(f.basename)) continue;
      const fm = readFrontmatter(this.app, f);
      if (!fm) continue;

      // origin_tension: scalar "[[X]]"
      const origine = extractBasenameFromWikilink(fm.origin_tension);
      if (origine) addEdge(f.basename, origine, "origin");

      // replaced_by: scalar "[[X]]"
      const sost = extractBasenameFromWikilink(fm.replaced_by);
      if (sost) addEdge(f.basename, sost, "sostituita");

      // links: array of "[[X]]"
      if (Array.isArray(fm.links)) {
        for (const c of fm.links) {
          const b = extractBasenameFromWikilink(c);
          if (b) addEdge(f.basename, b, "collegamento");
        }
      }

      // presupposes: array of "[[U-X]]" — principle -> presupposition (gold)
      if (Array.isArray(fm.presupposes)) {
        for (const u of fm.presupposes) {
          const b = extractBasenameFromWikilink(u);
          if (b) addEdge(f.basename, b, "presupposes");
        }
      }

      // wikilinks in body (resolved via metadataCache.links is better but we keep simple)
      const cache = this.app.metadataCache.getFileCache(f);
      if (cache?.links) {
        for (const lk of cache.links) {
          const target = lk.link.split("/").pop() || lk.link;
          addEdge(f.basename, target, "body");
        }
      }
    }

    // Invariant detection: a presupposition with > 1 incoming `presupposes`
    // edge is "load-bearing" (shared by multiple principles). Flag it so the
    // style can enlarge + brighten it and the tooltip can name the count.
    const supportCount = new Map<string, number>();
    for (const e of edges) {
      if (e.data.kind === "presupposes") {
        supportCount.set(e.data.target, (supportCount.get(e.data.target) ?? 0) + 1);
      }
    }
    for (const n of nodes) {
      if (n.data.layer === "presupposition") {
        const deg = supportCount.get(n.data.id ?? "") ?? 0;
        n.data.degree = deg;
        if (deg > 1) {
          n.data.loadBearing = true;
          n.data.fullTitle = `${n.data.fullTitle}\n⭐ Load-bearing assumption — supports ${deg} principles`;
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Angolo (rad) del centroide per ogni layer — usato per posizionare
   * i nuovi nodi che entrano dal toggle dei checkbox filtri.
   */
  /**
   * Restituisce il colore attivo per un layer leggendo dal preset selezionato
   * (o dal custom). Fallback al LAYER_COLORS default se chiave sconosciuta.
   */
  /**
   * Force full rebuild: destroy cy e ricostruisci, cosi' i preset/custom
   * colors vengono riapplicati. Chiamato quando l'utente cambia stile.
   */
  /**
   * Build a CSS background-image string of `count` randomly-placed white stars
   * (radial-gradients). Static per layer creation (a fresh seed each time the
   * layer is built / view opened).
   */
  private generateStarsBackground(count: number): string {
    const stars: string[] = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 100).toFixed(1);
      const y = (Math.random() * 100).toFixed(1);
      const size = (0.8 + Math.random() * 1.5).toFixed(1); // 0.8–2.3 px
      const opacity = (0.4 + Math.random() * 0.6).toFixed(2); // 0.4–1.0
      stars.push(
        `radial-gradient(circle ${size}px at ${x}% ${y}%, rgba(255,255,255,${opacity}) 0%, transparent 100%)`
      );
    }
    return stars.join(", ");
  }

  /** Translate the background layers per the current cy pan (parallax on PAN). */
  private applyParallaxTransform(): void {
    if (!this.cy) return;
    const GALAXY_PARALLAX = 0.15;
    const STARS_PARALLAX = 0.5;
    const pan = this.cy!.pan();
    if (this.galaxyLayer)
      this.galaxyLayer.setCssStyles({ transform: `translate(${pan.x * GALAXY_PARALLAX}px, ${pan.y * GALAXY_PARALLAX}px)` });
    if (this.starsLayer)
      this.starsLayer.setCssStyles({ transform: `translate(${pan.x * STARS_PARALLAX}px, ${pan.y * STARS_PARALLAX}px)` });
  }

  /**
   * Create or tear down the 3 parallax background layers per the
   * `galaxyBackground` setting (default on). Live — no full rebuild. Robust to
   * the container being emptied (uses isConnected, not just the field).
   */
  applyGalaxyClass(): void {
    if (!this.graphContainer) return;
    const on = this.plugin.settings.galaxyBackground !== false;
    const present = !!this.galaxyLayer?.isConnected;
    if (on && !present) {
      const galaxy = this.graphContainer.createDiv({
        cls: "antinomia-graph-galaxy-layer",
      });
      galaxy.createDiv({ cls: "antinomia-graph-galaxy-overlay" });
      const stars = this.graphContainer.createDiv({
        cls: "antinomia-graph-stars-layer",
      });
      stars.setCssStyles({ backgroundImage: this.generateStarsBackground(100) });
      this.galaxyLayer = galaxy;
      this.starsLayer = stars;
      this.applyParallaxTransform(); // align with current pan immediately
    } else if (!on) {
      this.galaxyLayer?.remove();
      this.starsLayer?.remove();
      this.galaxyLayer = null;
      this.starsLayer = null;
    }
  }

  applyStyleChange(): void {
    this.stopContinuousPhysics();
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
    this.rebuildGraph();
  }

  private activeLayerColor(colorKey: string): string {
    const styleName = this.plugin.settings.graphStyleName || "default";
    const palette: GraphColors =
      styleName === "custom"
        ? this.plugin.settings.graphCustomColors
        : (GRAPH_STYLE_PRESETS[styleName] || GRAPH_STYLE_PRESETS.default);
    return (palette as unknown as Record<string, string>)[colorKey] || LAYER_COLORS[colorKey] || "#888";
  }

  /**
   * Build an inline SVG data URI that renders a solid colored disc with a
   * soft radial-gradient halo around it (neon glow effect). The image is
   * used as the node's background-image so each node carries its own
   * per-color glow without external dependencies.
   *
   * The viewBox is 100x100; the inner disc has r=18 and the glow extends
   * out to r=50. Combined with `background-clip: none` and a 300% bg width,
   * the visible disc stays ~18px while the glow spreads ~27px beyond.
   */
  private glowSvgDataUri(color: string, bright = false): string {
    // Explicit width/height (not just viewBox) so Cytoscape rasterizes the
    // SVG at a stable pixel size and the halo stays centered during zoom.
    // Quadratic falloff (1-t)^2 with many stops, so the gradient blends
    // smoothly into the background without creating a perceived dark ring
    // (Mach band) where the alpha approaches zero.
    // `bright` variant: stronger stops + larger inner disc, used on hover.
    const stops = bright
      ? [
          [0, 1], [15, 0.92], [30, 0.72], [45, 0.50],
          [60, 0.32], [75, 0.18], [90, 0.06], [100, 0],
        ]
      : [
          [0, 1], [15, 0.72], [30, 0.49], [45, 0.30],
          [60, 0.16], [75, 0.06], [90, 0.01], [100, 0],
        ];
    const innerR = bright ? 16 : 14;
    const stopXml = stops
      .map(
        ([o, a]) =>
          `<stop offset="${o}%" stop-color="${color}" stop-opacity="${a}"/>`
      )
      .join("");
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
      '<defs><radialGradient id="g" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">' +
      stopXml +
      '</radialGradient></defs>' +
      '<circle cx="50" cy="50" r="50" fill="url(#g)"/>' +
      `<circle cx="50" cy="50" r="${innerR}" fill="${color}"/>` +
      "</svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  /**
   * Two SVG overlays:
   *  - edgePathsSvg: lives BELOW the Cytoscape canvases (so edges appear
   *    behind the nodes), holds the gradient/blur defs and the edge paths.
   *  - edgeLabelsSvg: lives ABOVE the canvases, holds only the node labels
   *    so they are never covered by edges or nodes.
   */
  private edgePathsSvg: SVGSVGElement | null = null;
  private edgeLabelsSvg: SVGSVGElement | null = null;

  /**
   * Create an absolutely-positioned SVG inside graphContainer that re-draws
   * every edge with a linear gradient (source-color -> target-color) and a
   * gaussian-blur halo, producing the neon "color-bleeding" look that the
   * Cytoscape canvas renderer can't produce natively.
   *
   * The SVG sits over Cytoscape's canvases (pointer-events: none) and is
   * kept in sync via `cy.on('render pan zoom position')`.
   */
  private setupEdgeGlowOverlay(): void {
    if (!this.cy || !this.graphContainer) return;
    const SVG_NS = "http://www.w3.org/2000/svg";

    // Make sure the container is a positioning context so absolute SVG fits.
    if (getComputedStyle(this.graphContainer).position === "static") {
      this.graphContainer.setCssStyles({ position: "relative" });
    }

    // (Re)create both overlays
    if (this.edgePathsSvg && this.edgePathsSvg.parentNode) {
      this.edgePathsSvg.parentNode.removeChild(this.edgePathsSvg);
    }
    if (this.edgeLabelsSvg && this.edgeLabelsSvg.parentNode) {
      this.edgeLabelsSvg.parentNode.removeChild(this.edgeLabelsSvg);
    }
    const mkOverlaySvg = (zIndex: string): SVGSVGElement => {
      const s = activeDocument.createElementNS(SVG_NS, "svg");
      s.setCssStyles({
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: zIndex,
      });
      return s;
    };
    // Paths SVG (BEHIND Cytoscape canvases): zIndex 0, prepended in DOM
    const pathsSvg = mkOverlaySvg("0");
    // Labels SVG (ABOVE Cytoscape canvases): zIndex 10, appended
    const labelsSvg = mkOverlaySvg("10");
    const svg = pathsSvg;
    // Two shared gaussian-blur filters (strong + mild). Per-edge color
    // comes from the linearGradient we generate dynamically below.
    const defs = activeDocument.createElementNS(SVG_NS, "defs");
    defs.setAttribute("id", "ant-edge-defs");
    const mkBlur = (id: string, stdDev: string): SVGFilterElement => {
      const f = activeDocument.createElementNS(SVG_NS, "filter");
      f.setAttribute("id", id);
      f.setAttribute("x", "-100%");
      f.setAttribute("y", "-100%");
      f.setAttribute("width", "300%");
      f.setAttribute("height", "300%");
      const b = activeDocument.createElementNS(SVG_NS, "feGaussianBlur");
      b.setAttribute("stdDeviation", stdDev);
      f.appendChild(b);
      return f;
    };
    // Edge halo blur — dialed back further: 7/2.5 → 4/1.5 → 2.5/1.
    // The glow is now a faint accent rather than an effect; the readable
    // line is the sharp core path drawn on top.
    defs.appendChild(mkBlur("ant-edge-blur-strong", "2.5"));
    defs.appendChild(mkBlur("ant-edge-blur-mild", "1"));
    svg.appendChild(defs);
    // <g> for edge paths inside pathsSvg
    const g = activeDocument.createElementNS(SVG_NS, "g");
    g.setAttribute("id", "ant-edge-paths");
    pathsSvg.appendChild(g);
    // <g> for node labels inside labelsSvg
    const gLabels = activeDocument.createElementNS(SVG_NS, "g");
    gLabels.setAttribute("id", "ant-node-labels");
    labelsSvg.appendChild(gLabels);

    // pathsSvg goes BEFORE the Cytoscape canvases in DOM order (so it renders behind)
    this.graphContainer.insertBefore(pathsSvg, this.graphContainer.firstChild);
    // labelsSvg goes AFTER (so it renders on top of nodes)
    this.graphContainer.appendChild(labelsSvg);
    this.edgePathsSvg = pathsSvg;
    this.edgeLabelsSvg = labelsSvg;

    const update = (): void => {
      if (!this.cy || !this.edgePathsSvg || !this.edgeLabelsSvg) return;
      const defsEl = this.edgePathsSvg.querySelector("#ant-edge-defs");
      const group = this.edgePathsSvg.querySelector("#ant-edge-paths");
      if (!defsEl || !group) return;
      // Resize both SVGs to match container
      const w = this.graphContainer!.clientWidth;
      const h = this.graphContainer!.clientHeight;
      this.edgePathsSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      this.edgeLabelsSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      // Clear existing per-edge gradients and paths
      Array.from(defsEl.querySelectorAll("linearGradient")).forEach((el) =>
        el.remove()
      );
      while (group.firstChild) group.removeChild(group.firstChild);
      // Compute the visible disc radius (in screen pixels) for a node,
      // based on its current state. The inner disc in our glow SVG is
      // r=14 normally and r=16 in the bright variant (hover-focus only).
      const cyZoom = this.cy.zoom();
      const discRadiusOf = (n: cytoscape.NodeSingular): number => {
        const innerR = n.hasClass("hover-focus") ? 16 : 14;
        const nodeWidth = n.width() || 44;
        return (innerR / 100) * nodeWidth * cyZoom;
      };

      // Re-draw every edge with src->tgt linear gradient
      let i = 0;
      this.cy.edges().forEach((edge: cytoscape.EdgeSingular) => {
        const src = edge.source();
        const tgt = edge.target();
        const sp = src.renderedPosition();
        const tp = tgt.renderedPosition();
        if (!sp || !tp) return;
        const srcColor = src.data("color") || "#9e9e9e";
        const tgtColor = tgt.data("color") || "#9e9e9e";
        // Shrink the line so it stops at the outer edge of each disc
        // instead of running into the node centers.
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        const dist = Math.hypot(dx, dy);
        const rSrc = discRadiusOf(src);
        const rTgt = discRadiusOf(tgt);
        if (dist <= rSrc + rTgt + 1) return; // nodes overlap, skip
        const ux = dx / dist;
        const uy = dy / dist;
        const sx = sp.x + ux * rSrc;
        const sy = sp.y + uy * rSrc;
        const tx = tp.x - ux * rTgt;
        const ty = tp.y - uy * rTgt;
        // No more dimming on hover — every edge stays at full brightness.
        const fadeFactor = 1;
        const gradId = `ant-grad-${i++}`;
        // Linear gradient running along the edge line
        const grad = activeDocument.createElementNS(SVG_NS, "linearGradient");
        grad.setAttribute("id", gradId);
        grad.setAttribute("gradientUnits", "userSpaceOnUse");
        grad.setAttribute("x1", String(sx));
        grad.setAttribute("y1", String(sy));
        grad.setAttribute("x2", String(tx));
        grad.setAttribute("y2", String(ty));
        const stop1 = activeDocument.createElementNS(SVG_NS, "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("stop-color", srcColor);
        const stop2 = activeDocument.createElementNS(SVG_NS, "stop");
        stop2.setAttribute("offset", "100%");
        stop2.setAttribute("stop-color", tgtColor);
        grad.appendChild(stop1);
        grad.appendChild(stop2);
        defsEl.appendChild(grad);

        const d = `M ${sx} ${sy} L ${tx} ${ty}`;
        // Strong outer halo — thinner: stroke 4→3.
        const haloOuter = activeDocument.createElementNS(SVG_NS, "path");
        haloOuter.setAttribute("d", d);
        haloOuter.setAttribute("stroke", `url(#${gradId})`);
        haloOuter.setAttribute("stroke-width", "3");
        haloOuter.setAttribute("stroke-linecap", "round");
        haloOuter.setAttribute("fill", "none");
        haloOuter.setAttribute("opacity", String(0.12 * fadeFactor));
        haloOuter.setAttribute("filter", "url(#ant-edge-blur-strong)");
        group.appendChild(haloOuter);
        // Inner halo — thinner: stroke 2.5→1.8.
        const haloInner = activeDocument.createElementNS(SVG_NS, "path");
        haloInner.setAttribute("d", d);
        haloInner.setAttribute("stroke", `url(#${gradId})`);
        haloInner.setAttribute("stroke-width", "1.8");
        haloInner.setAttribute("stroke-linecap", "round");
        haloInner.setAttribute("fill", "none");
        haloInner.setAttribute("opacity", String(0.22 * fadeFactor));
        haloInner.setAttribute("filter", "url(#ant-edge-blur-mild)");
        group.appendChild(haloInner);
        // Core (sharp, opaque) — thinner: stroke 1.4→0.9 for a subtler
        // overall line weight. Opacity kept high so the line stays crisp.
        const core = activeDocument.createElementNS(SVG_NS, "path");
        core.setAttribute("d", d);
        core.setAttribute("stroke", `url(#${gradId})`);
        core.setAttribute("stroke-width", "0.9");
        core.setAttribute("stroke-linecap", "round");
        core.setAttribute("fill", "none");
        core.setAttribute("opacity", String(0.85 * fadeFactor));
        group.appendChild(core);
      });

      // ---- Pass 2: node labels in the ABOVE SVG (always on top) ----
      const labelsGroup = this.edgeLabelsSvg.querySelector("#ant-node-labels");
      if (!labelsGroup) return;
      while (labelsGroup.firstChild) labelsGroup.removeChild(labelsGroup.firstChild);
      // Labels are forced white so they stay legible on the dark canvas
      // regardless of the active Obsidian theme.
      const labelColor = "#ffffff";
      const zoom = this.cy.zoom();
      // Skip rendering if the label would be too small to read (matches the
      // min-zoomed-font-size: 8 we used on the cy style).
      const minReadable = zoom * 10 >= 8;
      if (!minReadable) return;
      this.cy.nodes().forEach((node: cytoscape.NodeSingular) => {
        const label = node.data("label");
        if (!label) return;
        const pos = node.renderedPosition();
        if (!pos) return;
        // Bottom of the node disc in screen pixels (node is 32 graph-units)
        const halfHeight = 16 * zoom;
        const textY = pos.y + halfHeight + 4 + 9; // +text-margin-y +font-ascender
        const isHighlight =
          node.hasClass("hover-focus") || node.hasClass("hover-neighbor");
        // No more fade on hover — all labels stay at full opacity.
        const opacity = 1;
        const text = activeDocument.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(pos.x));
        text.setAttribute("y", String(textY));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "10");
        text.setAttribute(
          "font-family",
          "var(--font-text), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        );
        text.setAttribute("font-weight", isHighlight ? "600" : "400");
        text.setAttribute("fill", labelColor);
        text.setAttribute("opacity", String(opacity));
        text.setAttribute("paint-order", "stroke");
        text.setAttribute("stroke", "rgba(0,0,0,0.55)");
        text.setAttribute("stroke-width", "3");
        text.setAttribute("stroke-linejoin", "round");
        text.textContent = label;
        labelsGroup.appendChild(text);
      });
    };

    // Keep the overlay in sync with Cytoscape's viewport and node positions.
    // Throttle through requestAnimationFrame so we redraw at most once per
    // browser frame (~16ms / 60fps). Without this, with many edges the SVG
    // overlay re-renders multiple times per frame as the physics simulation
    // updates positions, causing visible lag.
    let rafPending = false;
    const scheduledUpdate = (): void => {
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(() => {
        rafPending = false;
        try {
          update();
        } catch {
          /* ignore */
        }
      });
    };
    this.cy.on("render pan zoom position", scheduledUpdate);
    // First draw
    window.setTimeout(update, 50);
  }

  private layerAngleFor(layer: string): number {
    const A: Record<string, number> = {
      tensione_aperta: -Math.PI / 2,
      tensione_risolta: -Math.PI / 2 + 0.6,
      tensione_elevata: -Math.PI / 2 + 1.2,
      principio: 0,
      substrate: Math.PI,
      defeated: Math.PI / 2,
      meta_nota: Math.PI / 2 + 0.9,
    };
    return A[layer] ?? 0;
  }

  rebuildGraph(): void {
    if (!this.graphContainer) return;
    const { nodes, edges } = this.collectGraphData();
    const newElements = [...nodes, ...edges];

    // CASO A: grafo gia' esistente -> differential add/remove con animazione,
    // viewport preservato, niente destroy/rebuild
    if (this.cy) {
      const newIds = new Set(newElements.map((e: cytoscape.ElementDefinition) => e.data.id));
      const currentIds = new Set<string>();
      this.cy.elements().forEach((el) => { currentIds.add(el.id()); });

      // UPDATE: per gli elementi che esistono in entrambi (stesso id),
      // aggiorna i data attributi (color, layer, label) cosi' i nodi
      // che cambiano tipo (es. tensione -> principio) vedono il nuovo colore.
      for (const el of newElements) {
        if (!currentIds.has(el.data.id ?? "")) continue;
        if ("source" in el.data) continue; // edge: non aggiornare
        const cyNode = this.cy.getElementById(el.data.id ?? "");
        if (cyNode && cyNode.length > 0) {
          cyNode.data({
            color: el.data.color,
            layer: el.data.layer,
            label: el.data.label,
            fullTitle: el.data.fullTitle,
            glow: el.data.glow,
            glowBright: el.data.glowBright,
          });
        }
      }

      // Defensive cleanup before node removal: clear any lingering hover-focus
      // / hover-neighbor classes. If the mouse is still over a node that's
      // about to be removed, Cytoscape's findNearestElements may try to
      // access the soon-destroyed node's _private.cy → null deref. Clearing
      // the class state up front avoids that race.
      this.cy.elements().removeClass("hover-focus hover-neighbor");

      const toRemove = this.cy.elements().filter(
        (el: cytoscape.SingularElementArgument) => !newIds.has(el.id())
      );
      if (toRemove.length > 0) {
        toRemove.animate(
          { style: { opacity: 0 } },
          {
            duration: 280,
            easing: "ease-out",
            complete: () => {
              try {
                this.cy?.remove(toRemove);
              } catch {
                /* ok */
              }
            },
          }
        );
      }

      const toAdd = newElements.filter(
        (e: cytoscape.ElementDefinition) => !currentIds.has(e.data.id ?? "")
      );
      if (toAdd.length > 0) {
        const positioned = toAdd.map((e: cytoscape.ElementDefinition) => {
          if ("source" in e.data) return e;
          const layer = e.data.layer || "unknown";
          const ang = this.layerAngleFor(layer);
          return {
            ...e,
            position: {
              x: Math.cos(ang) * 130 + (Math.random() - 0.5) * 40,
              y: Math.sin(ang) * 130 + (Math.random() - 0.5) * 40,
            },
          };
        });
        const added = this.cy.add(positioned);
        added.style({ opacity: 0 });
        added.animate(
          { style: { opacity: 1 } },
          { duration: 320, easing: "ease-out" }
        );
      }
      return;
    }

    if (nodes.length === 0) {
      this.graphContainer.empty();
      const msg = this.graphContainer.createDiv();
      msg.setCssStyles({
        padding: "20px",
        textAlign: "center",
        opacity: "0.6",
      });
      msg.setText(
        "No note matches active filters. Enable more layers above."
      );
      return;
    }

    // Cytoscape non parsea ne' var(...) ne' hsl(calc(...)) di Obsidian.
    // Trick: applica il valore a un div temporaneo e leggi il computed style,
    // che il browser ha gia' risolto a rgb(R,G,B).
    const resolveColor = (cssExpr: string, fallback: string): string => {
      const tmp = activeDocument.createElement("div");
      tmp.setCssStyles({
        color: cssExpr,
        display: "none",
      });
      activeDocument.body.appendChild(tmp);
      const computed = getComputedStyle(tmp).color;
      tmp.remove();
      return computed && computed !== "rgba(0, 0, 0, 0)" ? computed : fallback;
    };
    const TEXT_NORMAL = resolveColor("var(--text-normal)", "#dcddde");
    const ACCENT = resolveColor("var(--interactive-accent)", "#7c3aed");

    // Risolve i colori del grafo dal preset attivo (o dal custom).
    const styleName = this.plugin.settings.graphStyleName || "default";
    const C: GraphColors =
      styleName === "custom"
        ? this.plugin.settings.graphCustomColors
        : (GRAPH_STYLE_PRESETS[styleName] || GRAPH_STYLE_PRESETS.default);
    const TEXT_MUTED = C.label;
    // Applica background al container se il preset lo definisce, altrimenti usa il tema Obsidian.
    // backgroundColor only, so the galaxy nebula background-image (class) stays on top.
    if (this.graphContainer) {
      this.graphContainer.setCssStyles({ backgroundColor: C.background || "var(--background-primary)" });
      this.applyGalaxyClass();
    }

    this.cy = cytoscape({
      container: this.graphContainer,
      elements: [...nodes, ...edges],
      style: [
        // Smooth transitions per fade graduale (hover, filtri, ecc.)
        {
          selector: "node",
          style: {
            // The whole node (visible disc + glow halo) is rendered by the
            // SVG background-image. The Cytoscape node is sized to match
            // the FULL halo (54x54) so the gradient stays uniform on every
            // side; edges are pulled inward via target-distance-from-node
            // so they appear to connect to the inner disc, not the halo.
            // Cytoscape ignores the alpha channel of background-color in
            // some builds, so we use background-opacity: 0 explicitly to
            // suppress the node fill — only the SVG glow image is visible.
            "background-color": "#000000",
            "background-opacity": 0,
            "background-image": "data(glow)",
            "background-fit": "contain",
            // Suppress the default Cytoscape grab/active overlay (a dark
            // square halo that appears when dragging a node).
            "overlay-opacity": 0,
            "overlay-padding": 0,
            shape: "ellipse",
            // Labels are rendered by the SVG overlay (above the canvases),
            // not by Cytoscape — otherwise they paint on the same canvas
            // as edges and end up underneath the SVG paths.
            label: "",
            "text-opacity": 0,
            color: TEXT_MUTED,
            "font-size": "10px",
            "font-weight": 400,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            "text-wrap": "ellipsis",
            "text-max-width": "120px",
            "min-zoomed-font-size": 8,
            width: 32,
            height: 32,
            // Transparent border to expand the hit-area by 18px on each
            // side without changing the visible disc. Total hoverable
            // diameter = 32 + 18*2 = 68px while the visible pallino is 32.
            "border-width": 18,
            "border-color": "rgba(0,0,0,0)",
            "border-opacity": 0,
            // Base: glow rendered at full opacity. Hover state still
            // brightens further by switching to the glowBright SVG variant
            // (more opaque gradient stops + larger inner disc).
            "background-image-opacity": 1,
            "transition-property":
              "opacity, text-opacity, background-image-opacity, width, height, color",
            "transition-duration": 130,
            "transition-timing-function": "ease-out",
          },
        },
        // Load-bearing presuppositions (shared by >1 principle): 1.5x size +
        // brighter glow. No border — a translucent border ring would visually
        // detach from the disc and read as "two circles". The size + glow
        // delta alone is enough to flag the invariants.
        {
          selector: "node[?loadBearing]",
          style: {
            width: 48,
            height: 48,
            "background-image": "data(glowBright)",
          },
        },
        // All edges are kept in the graph (for the layout engine and
        // hit-testing) but invisible on the Cytoscape canvas. The SVG
        // overlay (see setupEdgeGlowOverlay) re-draws every edge with a
        // linear gradient running source-color -> target-color, plus a
        // gaussian-blur halo for the neon look. `visibility: hidden` is
        // stronger than `opacity: 0` and is respected in all cy states
        // (highlight, selected, active, faded).
        {
          selector: "edge",
          style: {
            width: 0.8,
            "line-color": C.edge,
            "curve-style": "bezier",
            "source-distance-from-node": -11,
            "target-distance-from-node": -11,
            visibility: "hidden",
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 2,
            "border-color": ACCENT,
            color: TEXT_NORMAL,
            "font-weight": 600,
          },
        },
        // Note: the previous Obsidian-like ".faded" fade-the-rest behavior
        // has been removed. Focus is now communicated by the hovered node
        // brightening (.highlight) instead of dimming everything else.
        // Hover focus: the node directly under the cursor — bigger + brighter
        {
          selector: "node.hover-focus",
          style: {
            "background-image": "data(glowBright)",
            "background-image-opacity": 1,
            width: 60,
            height: 60,
            color: TEXT_NORMAL,
            "font-weight": 600,
          },
        },
        // Hover neighbor: nodes connected to the focus — same size as base,
        // brighter glow than normal but kept BELOW the focus brightness
        // (uses the normal glow image at full opacity, not the bright one).
        {
          selector: "node.hover-neighbor",
          style: {
            "background-image-opacity": 1,
            color: TEXT_NORMAL,
            "font-weight": 600,
          },
        },
        {
          selector: "edge.highlight",
          style: {
            width: 1.8,
            "line-color": ACCENT,
            visibility: "hidden",
          },
        },
        // Hide edges in EVERY cy state — the SVG overlay is the only
        // renderer of edges in this graph view.
        {
          selector: "edge:selected, edge:active",
          style: {
            visibility: "hidden",
          },
        },
        // Suppress Cytoscape's default grab/active overlay on nodes too —
        // it's the dark square halo that shows up when dragging.
        {
          selector: "node:active, node:grabbed, node:selected",
          style: {
            "overlay-opacity": 0,
            "overlay-padding": 0,
          },
        },
      ],
      layout: { name: "preset" }, // placeholder; we'll apply real layout below
      userZoomingEnabled: false, // gestiamo lo zoom a mano per il raddoppio per step
      minZoom: 0.02,
      maxZoom: 8,
      zoom: 1.0,
    });

    // SVG overlay for principle-related edges. Cytoscape edges are flat
    // rectangles with hard caps; to get a real per-color gaussian glow we
    // hide those edges (opacity 0 in the cy style block above) and re-draw
    // them as <path> elements inside an absolutely-positioned SVG that sits
    // on top of the Cytoscape canvases. Each path is wrapped in an SVG
    // <filter> with <feGaussianBlur>, which gives a true gradient halo.
    this.setupEdgeGlowOverlay();

    // Parallax on PAN only (not zoom): translate the galaxy/stars layers a
    // fraction of the pan so nodes move 1:1, stars ~half, nebula barely.
    this.cy.on("pan", () => this.applyParallaxTransform());
    this.applyParallaxTransform(); // initial alignment

    // Custom wheel handler: ogni step della rotella raddoppia/dimezza lo zoom,
    // centrato sulla posizione del cursore (zoom-to-pointer).
    const onWheel = (e: WheelEvent): void => {
      if (!this.cy || !this.graphContainer) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.6 : 0.625;
      const currentZoom = this.cy.zoom();
      const newZoom = Math.max(0.02, Math.min(8, currentZoom * factor));
      const rect = this.graphContainer.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Stop animazione corrente lasciandola al punto attuale (no jumpToEnd)
      this.cy.stop(true, false);
      this.cy.animate({
        zoom: { level: newZoom, renderedPosition: { x: mx, y: my } },
        duration: 320,
        easing: "ease-out",
        queue: false,
      });
    };
    this.graphContainer?.addEventListener("wheel", onWheel, { passive: false });

    // Apply the chosen layout (clusters is a 2-step pipeline; others single-pass)
    this.applyLayoutToCy();

    // Click → open note
    this.cy.on("tap", "node", (evt: cytoscape.EventObject) => {
      const basename = evt.target.id();
      void this.app.workspace.openLinkText(basename, "", false);
    });

    // Note: il riassetto post-drag dei NODI e' gestito dal physics loop continuo.

    // ---- Inerzia sul pan del viewport (drag del background) ----
    let panVx = 0;
    let panVy = 0;
    let lastPanTime = 0;
    let lastPanPos = { x: 0, y: 0 };
    let inertiaRAF: number | null = null;

    const cancelInertia = (): void => {
      if (inertiaRAF !== null) {
        window.cancelAnimationFrame(inertiaRAF);
        inertiaRAF = null;
      }
    };

    this.cy.on("tapstart", (evt: cytoscape.EventObject) => {
      if (evt.target !== this.cy) return; // solo drag del background, non dei nodi
      cancelInertia();
      panVx = 0;
      panVy = 0;
      lastPanTime = performance.now();
      const pan = this.cy!.pan();
      lastPanPos = { x: pan.x, y: pan.y };
    });

    this.cy.on("tapdrag", (evt: cytoscape.EventObject) => {
      if (evt.target !== this.cy) return;
      const now = performance.now();
      const dt = Math.max(now - lastPanTime, 1);
      const pan = this.cy!.pan();
      // Velocita' in px per frame (16ms a 60fps)
      panVx = ((pan.x - lastPanPos.x) / dt) * 16;
      panVy = ((pan.y - lastPanPos.y) / dt) * 16;
      lastPanPos = { x: pan.x, y: pan.y };
      lastPanTime = now;
    });

    this.cy.on("tapend", (evt: cytoscape.EventObject) => {
      if (evt.target !== this.cy) return;
      if (Math.abs(panVx) < 0.8 && Math.abs(panVy) < 0.8) return;
      const decay = (): void => {
        if (!this.cy) return;
        this.cy.panBy({ x: panVx, y: panVy });
        panVx *= 0.92;
        panVy *= 0.92;
        if (Math.abs(panVx) > 0.15 || Math.abs(panVy) > 0.15) {
          inertiaRAF = window.requestAnimationFrame(decay);
        } else {
          inertiaRAF = null;
        }
      };
      inertiaRAF = window.requestAnimationFrame(decay);
    });

    // Hover: tooltip + fade non-neighbors (Obsidian-like)
    this.cy.on("mouseover", "node", (evt: cytoscape.EventObject) => {
      const node = evt.target;
      const fullTitle = node.data("fullTitle");
      const layer = node.data("layer");
      if (this.graphContainer)
        this.graphContainer.title = `${fullTitle}\n[${layer}]`;
      if (!this.cy) return;
      // The hovered node gets `hover-focus` (size bump + brighter glow);
      // its connected neighbors get `hover-neighbor` (brighter glow only,
      // no size change). The rest of the graph stays untouched.
      node.addClass("hover-focus");
      node.openNeighborhood().nodes().addClass("hover-neighbor");
      // Publish so other panes can highlight the same file.
      hoverBus.emit("enter", {
        path: node.data("path") || "",
        basename: node.id(),
        source: "graph",
      });
    });
    this.cy.on("mouseout", "node", (evt: cytoscape.EventObject) => {
      if (this.graphContainer) this.graphContainer.title = "";
      if (!this.cy) return;
      this.cy.elements().removeClass("hover-focus hover-neighbor");
      const node = evt.target;
      hoverBus.emit("leave", {
        path: node.data("path") || "",
        basename: node.id(),
        source: "graph",
      });
    });
  }

  /**
   * Cluster layout: pre-posiziona i nodi per layer in 7 "petali" radiali
   * intorno a un centro, poi rilascia fcose con randomize=false per fine-tuning.
   * Risultato: nodi sparsi in modo Obsidian-like, ma raggruppati per colore.
   */
  private applyClustersLayout(): void {
    if (!this.cy) return;

    // Angoli (in radianti) di ciascun layer attorno al centro del canvas
    const LAYER_ANGLE: Record<string, number> = {
      tensione_aperta: -Math.PI / 2,            // alto
      tensione_risolta: -Math.PI / 2 + 0.6,     // alto-destra
      tensione_elevata: -Math.PI / 2 + 1.2,     // destra-alto
      principio: 0,                              // destra
      substrate: Math.PI,                        // sinistra
      defeated: Math.PI / 2,                     // basso
      meta_nota: Math.PI / 2 + 0.9,              // basso-sinistra
    };

    // Conta i nodi per layer per calibrare il raggio del singolo cluster
    const byLayer: Record<string, cytoscape.NodeSingular[]> = {};
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      const layer = n.data("layer") || "unknown";
      (byLayer[layer] ??= []).push(n);
    });

    // Layout radiale: ogni layer e' un piccolo cerchio attorno al suo centroide
    const GLOBAL_R = 130;       // distanza del centroide dal centro
    const CLUSTER_R = 38;       // raggio interno del cluster del singolo layer
    const positions: Record<string, { x: number; y: number }> = {};

    for (const [layer, nodes] of Object.entries(byLayer)) {
      const ang = LAYER_ANGLE[layer] ?? 0;
      const cx = Math.cos(ang) * GLOBAL_R;
      const cy = Math.sin(ang) * GLOBAL_R;
      const r = CLUSTER_R + Math.sqrt(nodes.length) * 12; // scale by count
      nodes.forEach((n: cytoscape.NodeSingular, i: number) => {
        const inner = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
        positions[n.id()] = {
          x: cx + Math.cos(inner) * r + (Math.random() - 0.5) * 30,
          y: cy + Math.sin(inner) * r + (Math.random() - 0.5) * 30,
        };
      });
    }

    // Pre-posiziona, poi avvia la fisica continua: niente riassetto duro,
    // i nodi restano sparsi nei loro cluster e fluttuano.
    this.cy
      .layout({
        name: "preset",
        positions: (n: cytoscape.NodeSingular) => positions[n.id()] || { x: 0, y: 0 },
        animate: true,
        animationDuration: 400,
        fit: false, // niente auto-fit: vogliamo zoom medio, non panoramico
      } as cytoscape.LayoutOptions)
      .run();

    // Fit-to-content con padding generoso → centra la nuvola nel viewport,
    // poi cap dello zoom per non avvicinare troppo se ci sono pochi nodi.
    window.setTimeout(() => {
      if (!this.cy) return;
      this.cy.fit(undefined, 80);
      if (this.cy.zoom() > 1.4) this.cy.zoom(1.4);
      this.cy.center();
      this.startContinuousPhysics();
    }, 450);
  }

  // ---- Continuous physics ("fluttuante") ----
  private physicsRAF: number | null = null;
  private velocities: Map<string, { vx: number; vy: number }> = new Map();

  private startContinuousPhysics(): void {
    this.stopContinuousPhysics();
    if (!this.cy) return;

    // Init velocities
    this.velocities.clear();
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      this.velocities.set(n.id(), { vx: 0, vy: 0 });
    });

    const REPULSE = 5500;     // forza repulsiva tra nodi (dimezzata)
    const SPRING_K = 0.018;   // attrazione lungo edge (più rapida)
    const IDEAL_LEN = 55;     // distanza target lungo edge (dimezzata)
    const GRAVITY = 0.002;    // gravita' al centro piu' forte per cluster compatti
    const DAMPING = 0.78;     // smorzamento velocita' (meno smorzato = più snap)
    const MAX_SPEED = 6.0;    // velocità massima (raddoppiata per movimenti rapidi)

    const step = (): void => {
      if (!this.cy) return;
      const nodes = this.cy.nodes();
      const edges = this.cy.edges();
      const arr = nodes.toArray();

      // Forces accumulator
      const forces = new Map<string, { fx: number; fy: number }>();
      arr.forEach((n: cytoscape.NodeSingular) => forces.set(n.id(), { fx: 0, fy: 0 }));

      // Pairwise repulsion (O(n^2) — fine fino a ~150 nodi)
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        const ap = a.position();
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          const bp = b.position();
          const dx = bp.x - ap.x;
          const dy = bp.y - ap.y;
          const distSq = dx * dx + dy * dy + 4;
          const dist = Math.sqrt(distSq);
          const k = REPULSE / distSq;
          const fxa = (dx / dist) * k;
          const fya = (dy / dist) * k;
          const fa = forces.get(a.id())!;
          const fb = forces.get(b.id())!;
          fa.fx -= fxa;
          fa.fy -= fya;
          fb.fx += fxa;
          fb.fy += fya;
        }
      }

      // Spring force on edges
      edges.forEach((e: cytoscape.EdgeSingular) => {
        const s = e.source();
        const t = e.target();
        const sp = s.position();
        const tp = t.position();
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        const dist = Math.sqrt(dx * dx + dy * dy + 1);
        const stretch = dist - IDEAL_LEN;
        const k = SPRING_K * stretch;
        const fx = (dx / dist) * k;
        const fy = (dy / dist) * k;
        const fs = forces.get(s.id())!;
        const ft = forces.get(t.id())!;
        fs.fx += fx;
        fs.fy += fy;
        ft.fx -= fx;
        ft.fy -= fy;
      });

      // Light center gravity
      arr.forEach((n: cytoscape.NodeSingular) => {
        const p = n.position();
        const f = forces.get(n.id())!;
        f.fx -= p.x * GRAVITY;
        f.fy -= p.y * GRAVITY;
      });

      // Integrate velocity + position. Skip nodes the user is dragging.
      // Lazy-init velocity for nodes that joined the graph after
      // startContinuousPhysics() (e.g. a substrate created via PDF ingest
      // while the graph view was already open). Without this, the next
      // physics tick crashes on `velocities.get(n.id()).vx` because the
      // new node was never registered.
      arr.forEach((n: cytoscape.NodeSingular) => {
        const nid = n.id();
        let v = this.velocities.get(nid);
        if (!v) {
          v = { vx: 0, vy: 0 };
          this.velocities.set(nid, v);
        }
        if (n.grabbed()) {
          v.vx = 0;
          v.vy = 0;
          return;
        }
        const f = forces.get(nid)!;
        v.vx = (v.vx + f.fx) * DAMPING;
        v.vy = (v.vy + f.fy) * DAMPING;
        const speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
        if (speed > MAX_SPEED) {
          v.vx = (v.vx / speed) * MAX_SPEED;
          v.vy = (v.vy / speed) * MAX_SPEED;
        }
        const p = n.position();
        n.position({ x: p.x + v.vx, y: p.y + v.vy });
      });

      // Garbage-collect velocities for nodes that have been removed from
      // the graph so the Map doesn't grow unbounded across rebuilds.
      if (this.velocities.size > arr.length + 50) {
        const alive = new Set(arr.map((n: cytoscape.NodeSingular) => n.id()));
        for (const k of Array.from(this.velocities.keys())) {
          if (!alive.has(k)) this.velocities.delete(k);
        }
      }

      this.physicsRAF = window.requestAnimationFrame(step);
    };

    this.physicsRAF = window.requestAnimationFrame(step);
  }

  private stopContinuousPhysics(): void {
    if (this.physicsRAF !== null) {
      window.cancelAnimationFrame(this.physicsRAF);
      this.physicsRAF = null;
    }
  }

  private layoutOptions(): cytoscape.LayoutOptions {
    if (this.layoutName === "fcose") {
      // Spacious mode: much stronger repulsion + longer edges → nodes
      // spread far apart so edges are less likely to cross unrelated
      // nodes. Slower initial layout, cleaner visual. Toggle in Settings.
      const spacious = !!this.plugin.settings.graphSpaciousLayout;
      // Detect: is this the FIRST layout (no existing positions) or a
      // RE-LAYOUT after a filter toggle / change? In re-layout mode the
      // user expects existing nodes to STAY PUT — only new nodes should
      // get positioned, and the viewport should not snap-zoom.
      const hasExistingPositions =
        !!this.cy &&
        this.cy.nodes().length > 0 &&
        this.cy
          .nodes()
          .some((n) => {
            const p = (n as cytoscape.NodeSingular).position();
            return p && (p.x !== 0 || p.y !== 0);
          });
      if (hasExistingPositions) {
        // INCREMENTAL re-layout: minimal disturbance.
        // - randomize: false → start from existing positions
        // - fit: false → don't re-zoom the viewport (no "centering" effect)
        // - packComponents: false → don't recompact disconnected clusters
        // - few iterations → just enough to integrate new nodes
        // - quality "default" → faster, no need for full convergence
        return {
          name: "fcose",
          animate: true,
          animationDuration: 400,
          nodeRepulsion: spacious ? 55000 : 18000,
          idealEdgeLength: spacious ? 340 : 190,
          edgeElasticity: spacious ? 0.50 : 0.55,
          nodeSeparation: spacious ? 280 : 160,
          numIter: 800,
          gravity: 0,
          gravityRangeCompound: 1.5,
          gravityCompound: 1.0,
          gravityRange: 0,
          packComponents: false,
          randomize: false,
          fit: false,
          padding: 60,
          quality: "default",
        } as cytoscape.LayoutOptions;
      }
      // FIRST layout: full fcose run, picks positions from scratch.
      return {
        name: "fcose",
        animate: true,
        animationDuration: 1000,
        nodeRepulsion: spacious ? 55000 : 18000,
        idealEdgeLength: spacious ? 340 : 190,
        edgeElasticity: spacious ? 0.50 : 0.55,
        nodeSeparation: spacious ? 280 : 160,
        numIter: spacious ? 6500 : 5000,
        gravity: spacious ? 0.10 : 0.18,
        gravityRangeCompound: 1.5,
        gravityCompound: 1.0,
        gravityRange: spacious ? 4.5 : 3.8,
        packComponents: true,
        randomize: true,
        fit: true,
        padding: 60,
        quality: "proof",
      } as cytoscape.LayoutOptions;
    }
    if (this.layoutName === "concentric") {
      return {
        name: "concentric",
        concentric: (n: cytoscape.NodeSingular) => {
          const order: Record<string, number> = {
            principio: 4,
            tensione_elevata: 3,
            tensione_aperta: 2,
            tensione_risolta: 2,
            substrate: 1,
            defeated: 0,
            meta_nota: 0,
          };
          return order[n.data("layer")] ?? 0;
        },
        levelWidth: () => 1,
        minNodeSpacing: 30,
        animate: true,
      };
    }
    if (this.layoutName === "breadthfirst") {
      return {
        name: "breadthfirst",
        directed: true,
        spacingFactor: 1.2,
        animate: true,
      };
    }
    return { name: this.layoutName, animate: true, padding: 40 } as cytoscape.LayoutOptions;
  }

  applyLayoutToCy(): void {
    if (!this.cy) return;
    // Stop any running physics before switching layout
    this.stopContinuousPhysics();
    if (this.layoutName === "clusters") {
      this.applyClustersLayout();
      return;
    }
    const layout = this.cy.layout(this.layoutOptions());
    // Hook a post-processing edge-node repulsion pass if the user
    // enabled the spacious-layout experimental toggle. This runs AFTER
    // fcose converges and nudges nodes away from edges that don't touch
    // them — the only way to get true edge-node repulsion in fcose.
    if (this.plugin.settings.graphSpaciousLayout) {
      layout.on("layoutstop", () => {
        try {
          this.applyEdgeNodeRepulsion();
        } catch (e) {
          console.warn("[Antinomia] edge-node repulsion failed:", e);
        }
      });
    }
    layout.run();
  }

  /**
   * Post-layout pass: nudges each node away from edges that do NOT touch
   * it. cytoscape-fcose has no native edge-node repulsion; we simulate it
   * with a few iterations of perpendicular pushes. Stops early if no node
   * needed to move.
   */
  private applyEdgeNodeRepulsion(): void {
    if (!this.cy) return;
    const cy = this.cy;
    const MIN_DIST = 85; // graph-units: minimum allowed node-edge distance
    const MAX_ITER = 8;
    const PUSH_FACTOR = 0.9; // 0..1 how much of the deficit to apply per iter

    type Pt = { x: number; y: number };
    const distPointToSegment = (
      p: Pt,
      a: Pt,
      b: Pt
    ): { dist: number; cx: number; cy: number } => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.0001) {
        return { dist: Math.hypot(p.x - a.x, p.y - a.y), cx: a.x, cy: a.y };
      }
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + t * dx;
      const cy2 = a.y + t * dy;
      return { dist: Math.hypot(p.x - cx, p.y - cy2), cx, cy: cy2 };
    };

    const nodes = cy.nodes().toArray();
    const edges = cy.edges().toArray();
    // Wrap all position updates in cy.batch() so Cytoscape renders ONCE
    // per iteration instead of per-node — much smoother visually.
    for (let iter = 0; iter < MAX_ITER; iter++) {
      let totalMoved = 0;
      cy.batch(() => {
      for (const n of nodes) {
        const np = n.position() as Pt;
        let pushX = 0;
        let pushY = 0;
        for (const e of edges) {
          const s = e.source();
          const t = e.target();
          if (s.id() === n.id() || t.id() === n.id()) continue;
          const sp = s.position() as Pt;
          const tp = t.position() as Pt;
          const { dist, cx, cy: cyClosest } = distPointToSegment(np, sp, tp);
          if (dist < MIN_DIST && dist > 0.0001) {
            // Push perpendicular to the edge, away from the closest point
            const deficit = MIN_DIST - dist;
            const nx = (np.x - cx) / dist;
            const ny = (np.y - cyClosest) / dist;
            pushX += nx * deficit * PUSH_FACTOR;
            pushY += ny * deficit * PUSH_FACTOR;
          }
        }
        if (Math.abs(pushX) > 0.1 || Math.abs(pushY) > 0.1) {
          n.position({ x: np.x + pushX, y: np.y + pushY });
          totalMoved += Math.hypot(pushX, pushY);
        }
      }
      });
      if (totalMoved < 1) break;
    }
    // No cy.fit() here: keep the user's current viewport. fit() would
    // re-zoom and create the "swarm to center" effect we explicitly want
    // to avoid in re-layout after a filter toggle.
  }

  // Backward-compatible alias used by toolbar dropdown
  applyLayout(): void {
    this.applyLayoutToCy();
  }
}
