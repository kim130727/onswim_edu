import type {
  AssignmentField,
  CanvasChoiceSpec,
  ChoiceOption,
  NormalizedStudentItem,
  PresentationSpec,
  RendererData,
  RendererElement,
  StudentProblemContent,
} from "./types";

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function readInt(value: unknown): number | null {
  const n = readNumber(value);
  return n === null ? null : Math.trunc(n);
}

export function normalizeProblemContent(
  raw: StudentProblemContent | Record<string, unknown>,
  fallbackId: number | string = 0,
): NormalizedStudentItem {
  const content = asRecord(raw) as StudentProblemContent;
  let presentation = asRecord(content.presentation) as PresentationSpec;
  const inputSchema = asRecord(content.input_schema);
  const rawFields = Array.isArray(inputSchema.fields) ? inputSchema.fields : [];

  const fields: AssignmentField[] =
    rawFields.length > 0
      ? rawFields.map((entry) => {
          const obj = asRecord(entry);
          const rawChoices = Array.isArray(obj.choices) ? obj.choices : [];
          const choices: ChoiceOption[] = rawChoices.map((c) => {
            const co = asRecord(c);
            return {
              label: String(co.label ?? co.value ?? ""),
              value: String(co.value ?? co.choice_id ?? co.label ?? ""),
              choice_id: co.choice_id != null ? String(co.choice_id) : undefined,
            };
          });
          return {
            id: String(obj.id ?? "answer"),
            type: String(obj.type ?? "text"),
            maxLength: readInt(obj.max_length),
            choices,
          };
        })
      : [{ id: "answer", type: "text", maxLength: null, choices: [] }];

  const rawCanvasChoices = Array.isArray(presentation.canvas_choices)
    ? presentation.canvas_choices
    : [];
  const canvasChoices: CanvasChoiceSpec[] = rawCanvasChoices.map((entry) => {
    const co = asRecord(entry);
    return {
      choice_id: co.choice_id != null ? String(co.choice_id) : undefined,
      value: co.value != null ? String(co.value) : undefined,
      label: co.label != null ? String(co.label) : undefined,
      element_ids: Array.isArray(co.element_ids)
        ? co.element_ids.map((id) => String(id))
        : [],
    };
  });

  let rendererData = asRecord(content.renderer_data) as RendererData;
  // Older operator exercises were authored as choice questions with a
  // selectable circle. Keep their choice IDs for drafts and grading.
  const options = fields[0].choices;
  const optionLabels = options.map(({ label }) => label.trim());
  const isSymbolSet = optionLabels.length >= 2 &&
    optionLabels.every((label) => /^[<>=≤≥≠+−×÷*/-]$/.test(label)) &&
    new Set(optionLabels).size === optionLabels.length;
  if (
    fields.length === 1 && fields[0].type === "choice" && isSymbolSet &&
    ["choice", "panel_input", ""].includes(presentation.mode ?? "") &&
    presentation.show_canvas !== false
  ) {
    const blanks = rendererData.elements?.filter((element) => {
      const interaction = asRecord(element.interaction);
      return element.id && element.type === "circle" &&
        (readNumber(asRecord(element.attributes).r) ?? 0) > 0 &&
        ["input", "select", "choice"].includes(String(interaction.type)) &&
        (interaction.role === "answer" || interaction.include_in_submission === true);
    });
    if (blanks?.length === 1) {
      const id = String(blanks[0].id);
      presentation = { ...presentation, mode: "canvas_slots", canvas_bindings: { [id]: 0 } };
      rendererData = {
        ...rendererData,
        elements: rendererData.elements?.map((element) => element.id === id ? {
          ...element,
          interaction: {
            ...element.interaction, type: "input", role: "answer",
            value_type: optionLabels.every((label) => /^[<>=≤≥≠]$/.test(label)) ? "comparison_operator" : "operator",
            max_length: 1,
          },
        } : element),
      };
    }
  }
  if (presentation.mode === "canvas_slots") {
    for (const element of rendererData.elements ?? []) {
      const index = presentation.canvas_bindings?.[String(element.id ?? "")];
      const field = index === undefined ? undefined : fields[index];
      if (field?.choices.length === 0 && asRecord(element.interaction).value_type === "fraction") {
        field.type = "fraction";
      }
    }
  }
  const layoutData = asRecord(content.layout_data);
  const semanticData = asRecord(content.semantic_data);

  return {
    id: (content.id as number | string | undefined) ?? fallbackId,
    problemId: String(content.problem_id ?? content.id ?? fallbackId),
    title: String(content.title ?? ""),
    prompt: String(content.prompt ?? ""),
    revision: String(content.revision ?? ""),
    language: String(content.language ?? "ko"),
    problemType: String(content.problem_type ?? ""),
    ownerName: String(content.owner_name ?? ""),
    sourceCredit: String(content.source_credit ?? ""),
    rightsNote: String(content.rights_note ?? ""),
    presentation,
    canvasInputs: presentation.mode === "canvas_slots",
    canvasSelect: presentation.mode === "canvas_select",
    canvasSelectMulti: presentation.multi === true,
    canvasChoices,
    showCanvas: presentation.show_canvas !== false,
    unit: String(inputSchema.unit ?? ""),
    fields,
    semantic: semanticData,
    renderer: rendererData,
    layout: layoutData,
    rawContent: content,
  };
}

export type BoundsTuple = [number, number, number, number];

export function elementVisualBounds(element: RendererElement): BoundsTuple | null {
  const a = asRecord(element.attributes);
  if (!element.attributes || Object.prototype.hasOwnProperty.call(a, "transform")) {
    return null;
  }
  const n = (key: string, fallback = 0): number =>
    readNumber(a[key]) ?? readNumber(element[key]) ?? fallback;

  const x = n("x");
  const y = n("y");
  switch (element.type) {
    case "rect":
    case "image":
    case "text_box":
      return [x, y, x + n("width"), y + n("height")];
    case "line":
      return [
        Math.min(n("x1"), n("x2")),
        Math.min(n("y1"), n("y2")),
        Math.max(n("x1"), n("x2")),
        Math.max(n("y1"), n("y2")),
      ];
    case "circle":
      return [n("cx") - n("r"), n("cy") - n("r"), n("cx") + n("r"), n("cy") + n("r")];
    case "polygon": {
      const rawPoints = a.points ?? element.points;
      const pts: Array<[number, number]> = [];
      if (Array.isArray(rawPoints)) {
        for (const p of rawPoints) {
          if (Array.isArray(p) && p.length >= 2) {
            const px = readNumber(p[0]);
            const py = readNumber(p[1]);
            if (px !== null && py !== null) pts.push([px, py]);
          }
        }
      } else if (typeof rawPoints === "string") {
        for (const token of rawPoints.trim().split(/\s+/)) {
          const xy = token.split(",");
          if (xy.length === 2) {
            const px = readNumber(xy[0]);
            const py = readNumber(xy[1]);
            if (px !== null && py !== null) pts.push([px, py]);
          }
        }
      }
      if (pts.length === 0) return null;
      return [
        Math.min(...pts.map((p) => p[0])),
        Math.min(...pts.map((p) => p[1])),
        Math.max(...pts.map((p) => p[0])),
        Math.max(...pts.map((p) => p[1])),
      ];
    }
    case "path": {
      const d = String(a.d ?? element.d ?? "");
      const matches = d.match(/[-+]?\d*\.?\d+/g) ?? [];
      if (matches.length < 2) return null;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i + 1 < matches.length; i += 2) {
        const px = Number(matches[i]);
        const py = Number(matches[i + 1]);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          xs.push(px);
          ys.push(py);
        }
      }
      if (xs.length === 0 || ys.length === 0) return null;
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case "text": {
      const rawText = String(element.text ?? "");
      if (rawText.trim().length === 0) return null;
      const size = n("font-size", 16);
      const lines = rawText.split("\n");
      const width =
        Math.max(
          ...lines.map((line) => {
            let sum = 0;
            for (const ch of line) {
              const code = ch.codePointAt(0) ?? 0;
              sum += code === 32 ? 0.3 : code < 128 ? 0.56 : 1.0;
            }
            return sum;
          }),
        ) * size;
      const anchor = String(a["text-anchor"] ?? "");
      const left =
        x - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
      return [
        left,
        y - size * 1.05,
        left + width,
        y + size * (0.3 + (lines.length - 1) * 1.25),
      ];
    }
    default:
      return null;
  }
}

function hasVisualPresence(element: RendererElement): boolean {
  const a = asRecord(element.attributes);
  if (element.type === "text") {
    return String(element.text ?? "").trim().length > 0;
  }
  if (element.type === "rect" || element.type === "image" || element.type === "text_box") {
    const w = readNumber(a.width ?? element.width) ?? 0;
    const h = readNumber(a.height ?? element.height) ?? 0;
    return w > 0 && h > 0;
  }
  return true;
}

function extractSemanticChoices(semantic: Record<string, unknown>): string[] {
  const choices = semantic.choices;
  if (Array.isArray(choices)) {
    return choices
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const obj = asRecord(entry);
        return String(obj.text ?? obj.label ?? obj.value ?? "");
      })
      .filter((s) => s.length > 0);
  }
  return [];
}

/**
 * Display-only projection matching Flutter's `problemVisualRenderer`.
 * Strips duplicate prompt/instruction, choice, and answer_prompt text elements
 * while preserving diagram labels and canvas choices, and computes a tight viewport.
 */
export function projectVisualRenderer(
  item: NormalizedStudentItem,
  canvasChoiceElementIds: Set<string> = new Set(),
): RendererData {
  const renderer = item.renderer;
  if (renderer.presentation_resolved === true) return renderer;
  const raw = renderer.elements;
  if (!Array.isArray(raw)) return renderer;

  const normalize = (value: string) => value.replace(/\s+/g, "");
  const prompt = normalize(item.prompt);
  const choiceText = (value: string) =>
    normalize(value).replace(/^(?:\([1-9]\)|[①-⑩]|[1-9][.)])/, "");

  const semanticChoices = extractSemanticChoices(item.semantic);
  const fieldChoices = item.fields.flatMap((f) => f.choices.map((c) => c.label));
  const allChoices = semanticChoices.length > 0 ? semanticChoices : fieldChoices;
  const choiceSet = new Set(allChoices.map(choiceText));

  const questionSlotIds = new Set<string>();
  const choiceSlotIds = new Set<string>();
  const canvasSlotIds = new Set<string>();
  const answerPromptSlotIds = new Set<string>();

  const regions = item.layout.regions;
  if (Array.isArray(regions)) {
    for (const reg of regions) {
      const r = asRecord(reg);
      const role = String(r.role ?? "").toLowerCase();
      const slotIds = Array.isArray(r.slot_ids)
        ? r.slot_ids.map((id) => String(id).toLowerCase())
        : [];
      if (role === "instruction" || role === "question") {
        slotIds.forEach((id) => questionSlotIds.add(id));
      } else if (role === "choices" || role === "choice" || role === "options" || role === "option") {
        slotIds.forEach((id) => choiceSlotIds.add(id));
      } else if (role === "diagram" || role === "canvas") {
        slotIds.forEach((id) => canvasSlotIds.add(id));
      }
    }
  }

  const slots = item.layout.slots;
  if (Array.isArray(slots)) {
    for (const slot of slots) {
      const s = asRecord(slot);
      const slotContent = asRecord(s.content);
      const styleRole = String(slotContent.style_role ?? "").toLowerCase();
      const semanticRole = String(slotContent.semantic_role ?? "").toLowerCase();
      const id = String(s.id ?? "").toLowerCase();
      if (!id) continue;
      if (semanticRole === "answer_prompt") {
        answerPromptSlotIds.add(id);
        questionSlotIds.delete(id);
        choiceSlotIds.delete(id);
        canvasSlotIds.delete(id);
      } else if (semanticRole === "canvas" || semanticRole === "diagram_label") {
        canvasSlotIds.add(id);
        questionSlotIds.delete(id);
        choiceSlotIds.delete(id);
      } else if (semanticRole === "question" || semanticRole === "instruction") {
        questionSlotIds.add(id);
        choiceSlotIds.delete(id);
        canvasSlotIds.delete(id);
      } else if (semanticRole === "choice" || semanticRole === "choices" || semanticRole === "option") {
        choiceSlotIds.add(id);
        questionSlotIds.delete(id);
        canvasSlotIds.delete(id);
      } else if (styleRole === "question" || styleRole === "instruction") {
        questionSlotIds.add(id);
      } else if (styleRole === "choice" || styleRole === "choices" || styleRole === "option") {
        choiceSlotIds.add(id);
      }
    }
  }

  const removed: RendererElement[] = [];
  const kept: RendererElement[] = [];

  for (const element of raw) {
    if (!element || typeof element !== "object" || canvasChoiceElementIds.has(String(element.id ?? ""))) {
      kept.push(element);
      continue;
    }
    const attributes = asRecord(element.attributes);
    const role = String(attributes["data-semantic-role"] ?? "").toLowerCase();
    const text = normalize(String(element.text ?? ""));
    const sourceRef = String(element.source_ref ?? "").toLowerCase();
    const refs = asRecord(element.refs);
    const layoutSlotId = String(refs.layout_slot_id ?? "").toLowerCase();
    const identity = `${element.id ?? ""} ${sourceRef} ${layoutSlotId} ${JSON.stringify(element.refs ?? "")} ${JSON.stringify(element.metadata ?? "")}`.toLowerCase();

    const isExplicitCanvas =
      role === "canvas" ||
      role === "diagram_label" ||
      canvasSlotIds.has(sourceRef) ||
      canvasSlotIds.has(layoutSlotId);

    const isExplicitQuestionSlot =
      questionSlotIds.has(sourceRef) ||
      questionSlotIds.has(layoutSlotId) ||
      Array.from(questionSlotIds).some((id) => identity.includes(id));

    const isPromptRole =
      isExplicitQuestionSlot ||
      role === "question" ||
      role === "instruction" ||
      /\b(?:instruction|question|slot\.q\d*)\b/.test(identity);

    const hasLabelMarker =
      identity.includes(".lb.") ||
      identity.includes(".lb") ||
      identity.includes("_lb_") ||
      identity.includes("label");

    const isDiagramLabel =
      hasLabelMarker ||
      role === "label" ||
      role === "diagram_label" ||
      (role === "symbol_label" && !/\b(?:slot\.opt\d*)\b/.test(identity));

    const promptMatches =
      prompt.length > 0 &&
      text.length > 0 &&
      (prompt === text ||
        (text.length >= 6 &&
          (prompt.includes(text) ||
            text.includes(prompt) ||
            (text.length >= 10 &&
              prompt.length >= 10 &&
              prompt.slice(0, Math.min(15, prompt.length)) ===
                text.slice(0, Math.min(15, text.length))))));

    const isPrompt =
      !isExplicitCanvas &&
      text.length > 0 &&
      !isDiagramLabel &&
      (prompt === text || (isPromptRole && (promptMatches || prompt.length === 0)));

    const isExplicitChoiceSlot =
      choiceSlotIds.has(sourceRef) ||
      choiceSlotIds.has(layoutSlotId) ||
      Array.from(choiceSlotIds).some((id) => identity.includes(id));

    const isChoiceRole =
      (role === "choice" ||
        role === "option" ||
        isExplicitChoiceSlot ||
        /\b(?:choice|option|slot\.c\d+|slot\.opt\d*)\b/.test(identity)) &&
      !hasLabelMarker;

    const isChoice =
      !isExplicitCanvas &&
      text.length > 0 &&
      !isDiagramLabel &&
      isChoiceRole &&
      (choiceSet.has(choiceText(text)) ||
        (allChoices.length > 0 &&
          isExplicitChoiceSlot &&
          (role === "choice" ||
            role === "option" ||
            (text.length < 20 && !text.includes("(") && !text.includes(")")))));

    const isAnswerPrompt =
      role === "answer_prompt" ||
      answerPromptSlotIds.has(sourceRef) ||
      answerPromptSlotIds.has(layoutSlotId);

    if (isPrompt || isChoice || isAnswerPrompt) {
      removed.push(element);
    } else {
      kept.push(element);
    }
  }

  if (removed.length === 0) return renderer;

  // Remove choice frame rects that only contain removed choice text.
  const filteredKept = kept.filter((element) => {
    if (
      !element ||
      element.type !== "rect" ||
      !/choice|option/i.test(`${element.id ?? ""} ${element.source_ref ?? ""}`)
    ) {
      return true;
    }
    const box = elementVisualBounds(element);
    if (!box) return true;

    const belongsInside = (other: RendererElement): boolean => {
      const bounds = elementVisualBounds(other);
      if (!bounds) return false;
      const cx = (bounds[0] + bounds[2]) / 2;
      const cy = (bounds[1] + bounds[3]) / 2;
      if (cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3]) {
        return true;
      }
      if (other.type === "text") {
        const a = asRecord(other.attributes);
        const tx = readNumber(a.x);
        const ty = readNumber(a.y);
        if (tx !== null && ty !== null && tx >= box[0] && tx <= box[2] && ty >= box[1] && ty <= box[3]) {
          return true;
        }
      }
      return false;
    };

    const containsRemoved = removed.some(belongsInside);
    const containsOtherKept = kept.some((other) => other !== element && belongsInside(other));
    return !(containsRemoved && !containsOtherKept);
  });

  const result: RendererData = { ...renderer, elements: filteredKept };
  const visualElements = filteredKept.filter(hasVisualPresence);
  const bounds = visualElements.map(elementVisualBounds);
  if (bounds.length > 0 && bounds.every((b): b is BoundsTuple => b !== null)) {
    const left = Math.min(...bounds.map((b) => b[0])) - 24;
    const top = Math.min(...bounds.map((b) => b[1])) - 24;
    const right = Math.max(...bounds.map((b) => b[2])) + 24;
    const bottom = Math.max(...bounds.map((b) => b[3])) + 24;
    result.presentation_viewport = {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }
  return result;
}

/**
 * Prepares renderer elements for canvas input mode, applying whole-answer
 * capacity fallback and `_value_type` hints identically to Flutter's StudentProblemCanvas.
 */
export function prepareCanvasRenderer(item: NormalizedStudentItem): RendererData {
  const canvasChoices = item.canvasSelect ? item.canvasChoices : [];
  const canvasChoiceElementIds = new Set<string>();
  for (const choice of canvasChoices) {
    for (const id of choice.element_ids ?? []) {
      canvasChoiceElementIds.add(String(id));
    }
  }
  const renderer = projectVisualRenderer(item, canvasChoiceElementIds);
  if (!item.canvasInputs) {
    return renderer;
  }

  const bindings = asRecord(item.presentation.canvas_bindings) as Record<string, number>;
  const bindingCounts = new Map<number, number>();
  for (const field of Object.values(bindings)) {
    if (typeof field === "number") {
      bindingCounts.set(field, (bindingCounts.get(field) ?? 0) + 1);
    }
  }

  const rawElements = Array.isArray(renderer.elements) ? renderer.elements : [];
  const elements: RendererElement[] = rawElements.map((raw) => {
    const element: RendererElement = { ...asRecord(raw) };
    const interaction: Record<string, unknown> = { ...asRecord(element.interaction) };
    const field = bindings[String(element.id ?? "")];
    const hasIntegerLimit =
      typeof field === "number" &&
      field >= 0 &&
      field < item.fields.length &&
      item.fields[field].maxLength !== null;

    const fieldType = item.fields[field]?.type;
    if (fieldType === "operator" || fieldType === "comparison_operator") {
      interaction.value_type = fieldType;
      interaction.max_length = 1;
    }
    const valueType = String(interaction.value_type ?? "");
    if (
      typeof field === "number" &&
      bindingCounts.get(field) === 1 &&
      interaction.role === "answer" &&
      !["digit", "digits", "operator", "comparison_operator"].includes(valueType) &&
      interaction.keyboard !== "operator"
    ) {
      interaction.max_length = Math.max(64, readInt(interaction.max_length) ?? 0);
      interaction.auto_advance = false;
    }

    if (
      interaction.keyboard === "number" &&
      !hasIntegerLimit &&
      ["number", "integer", "decimal", "fraction"].includes(valueType)
    ) {
      interaction.keyboard = "decimal";
    }

    element.input_style = {
      ...asRecord(element.input_style),
      _value_type: interaction.value_type,
    };

    if (interaction.value_type === "number") {
      interaction.value_type = "decimal";
      if (interaction.keyboard === "number") {
        interaction.keyboard = "decimal";
      }
    }
    element.interaction = interaction;
    return element;
  });

  return {
    ...renderer,
    elements,
    field_bindings: bindings,
  };
}

/**
 * Resolves image asset hrefs for data URIs, http(s), and relative paths.
 */
export function resolveImageHref(href: string, assetBaseUrl?: string): string {
  const trimmed = href.trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    if (assetBaseUrl && /^https?:\/\//i.test(assetBaseUrl)) {
      try {
        const origin = new URL(assetBaseUrl).origin;
        return `${origin}${trimmed}`;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (assetBaseUrl) {
    const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
    return `${base}${trimmed.replace(/^\.\//, "")}`;
  }
  return trimmed;
}

export interface CanvasMetrics {
  originX: number;
  originY: number;
  logicalWidth: number;
  logicalHeight: number;
  originalWidth: number;
  originalHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  background: string;
}

export function computeCanvasMetrics(
  renderer: RendererData,
  availableWidth: number,
  maxCanvasHeight = 420,
): CanvasMetrics {
  const viewBox = asRecord(renderer.view_box);
  const originalWidth = readNumber(viewBox.width) ?? 928;
  const originalHeight = readNumber(viewBox.height) ?? 426;
  const viewport = asRecord(renderer.presentation_viewport);
  const logicalWidth = readNumber(viewport.width) ?? originalWidth;
  const logicalHeight = readNumber(viewport.height) ?? originalHeight;
  const originX = readNumber(viewport.x) ?? 0;
  const originY = readNumber(viewport.y) ?? 0;
  const background =
    typeof viewBox.background === "string" && viewBox.background.trim() && viewBox.background !== "none"
      ? viewBox.background
      : "#FFFFFF";

  const clampedAvail = Math.max(1, Math.min(960, availableWidth));
  const preferredWidth = Math.min(clampedAvail, Math.max(320, logicalWidth * 1.5));
  let canvasWidth = preferredWidth;
  let canvasHeight = canvasWidth * (logicalHeight / logicalWidth);
  if (canvasHeight > maxCanvasHeight) {
    canvasHeight = maxCanvasHeight;
    canvasWidth = canvasHeight * (logicalWidth / logicalHeight);
  }
  if (canvasHeight < 96) {
    canvasHeight = 96;
  }
  const scale = canvasWidth / logicalWidth;

  return {
    originX,
    originY,
    logicalWidth,
    logicalHeight,
    originalWidth,
    originalHeight,
    canvasWidth,
    canvasHeight,
    scale,
    background,
  };
}
