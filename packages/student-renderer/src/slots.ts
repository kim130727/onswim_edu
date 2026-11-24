import { asRecord, readInt, readNumber } from "./presentation";
import type {
  GradingResultModel,
  InputSlot,
  NormalizedStudentItem,
  RectBox,
  RendererData,
  RendererElement,
  StudentLocale,
} from "./types";
import { translateStudent } from "./strings";

function slotIdentity(element: RendererElement): string {
  const id = String(element.id ?? "").toLowerCase();
  const sourceRef = String(element.source_ref ?? "").toLowerCase();
  const metadataSlotId = String(asRecord(element.metadata).layout_slot_id ?? "").toLowerCase();
  const refsSlotId = String(asRecord(element.refs).layout_slot_id ?? "").toLowerCase();
  return `${id} ${sourceRef} ${metadataSlotId} ${refsSlotId}`;
}

export function looksLikeInputTextBox(element: RendererElement): boolean {
  const interaction = asRecord(element.interaction);
  if (String(interaction.type ?? "").toLowerCase() === "input") return true;
  const text = String(element.text ?? "").trim();
  if (text !== "□") return false;
  const id = slotIdentity(element);
  if (id.includes("instruction")) return false;
  return id.includes("answer") || id.includes("blank") || id.includes("carry") || id.includes("result");
}

function contributesToAnswer(element: RendererElement): boolean {
  const interaction = asRecord(element.interaction);
  if (interaction.include_in_submission === true) return true;
  if (String(interaction.role ?? "").toLowerCase() === "answer") return true;
  const id = slotIdentity(element);
  return id.includes("answer") || id.includes("result");
}

function looksLikeInputRect(
  element: RendererElement,
  attributes: Record<string, unknown>,
  rect: RectBox,
): boolean {
  const interaction = asRecord(element.interaction);
  if (String(interaction.type ?? "").toLowerCase() === "input") return true;
  if (rect.width < 24 || rect.height < 24 || rect.width > 120) return false;
  const ratio = rect.width / rect.height;
  if (ratio < 0.65 || ratio > 1.35) return false;
  const id = slotIdentity(element);
  if (id.includes("background") || id.includes("circle") || id.includes("card")) return false;
  const stroke = String(attributes.stroke ?? "").trim();
  if (!stroke || stroke === "none") return false;
  const fill = String(attributes.fill ?? "").trim().toLowerCase();
  return !fill || fill === "none" || fill === "#ffffff" || fill === "#fff";
}

function looksLikeInputCircle(element: RendererElement): boolean {
  const interaction = asRecord(element.interaction);
  const type = String(interaction.type ?? "").toLowerCase();
  if (type === "input") return true;
  if (type !== "select" && type !== "choice") return false;
  return contributesToAnswer(element);
}

function looksLikeInputPath(element: RendererElement): boolean {
  const interaction = asRecord(element.interaction);
  const type = String(interaction.type ?? "").toLowerCase();
  if (type === "input") return true;
  if (type !== "select" && type !== "choice") return false;
  return contributesToAnswer(element);
}

function pathBounds(d: string | undefined): RectBox | null {
  if (!d || !d.trim()) return null;
  const nums = d.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length === 0 || ys.length === 0) return null;
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

function elementRect(element: RendererElement): RectBox | null {
  const attributes = asRecord(element.attributes);
  if (element.type === "path") {
    return pathBounds(String(attributes.d ?? element.d ?? ""));
  }
  const x = readNumber(attributes.x) ?? readNumber(attributes["data-box-x"]);
  const y = readNumber(attributes.y) ?? readNumber(attributes["data-box-y"]);
  const width =
    readNumber(attributes.width) ??
    readNumber(attributes["data-box-width"]) ??
    readNumber(attributes.max_width);
  const height = readNumber(attributes.height) ?? readNumber(attributes["data-box-height"]);
  if (x === null || y === null || width === null || height === null) return null;
  return { left: x, top: y, width, height };
}

function isPureInvisibleSlot(element: RendererElement): boolean {
  const type = String(element.type ?? "");
  if (type !== "rect" && type !== "circle" && type !== "line") return false;
  if (Object.keys(asRecord(element.interaction)).length > 0) return false;
  const attributes = asRecord(element.attributes);
  const fill = String(attributes.fill ?? "").trim().toLowerCase();
  const stroke = String(attributes.stroke ?? "").trim().toLowerCase();
  const isFillNone = !fill || fill === "none";
  const isStrokeNone = stroke === "none";
  return isFillNone && isStrokeNone;
}

function isLegacyAnswerBlankInsideTextBox(
  element: RendererElement,
  elements: RendererElement[],
): boolean {
  if (element.type !== "rect") return false;
  if (Object.keys(asRecord(element.interaction)).length > 0) return false;
  const id = slotIdentity(element);
  if (!id.includes("answer") || !id.includes("blank")) return false;
  const rect = elementRect(element);
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const rectArea = rect.width * rect.height;

  for (const other of elements) {
    if (other === element || other.type !== "text_box" || looksLikeInputTextBox(other)) {
      continue;
    }
    const textRect = elementRect(other);
    if (!textRect || textRect.width <= 0 || textRect.height <= 0) continue;
    const ix = Math.max(0, Math.min(rect.left + rect.width, textRect.left + textRect.width) - Math.max(rect.left, textRect.left));
    const iy = Math.max(0, Math.min(rect.top + rect.height, textRect.top + textRect.height) - Math.max(rect.top, textRect.top));
    if (rectArea > 0 && (ix * iy) / rectArea > 0.65) {
      return true;
    }
  }
  return false;
}

export function rendererVisibleElements(elements: unknown): RendererElement[] {
  if (!Array.isArray(elements)) return [];
  const typed = elements.filter((e): e is RendererElement => Boolean(e && typeof e === "object"));
  return typed
    .filter((el) => !isLegacyAnswerBlankInsideTextBox(el, typed))
    .filter((el) => !isPureInvisibleSlot(el));
}

function maxLengthForInput(element: RendererElement): number {
  const interaction = asRecord(element.interaction);
  const maxLength = readInt(interaction.max_length);
  return maxLength !== null && maxLength > 0 ? maxLength : 1;
}

function digitsOnlyForInput(element: RendererElement): boolean {
  const interaction = asRecord(element.interaction);
  const valueType = String(interaction.value_type ?? "").toLowerCase();
  const keyboard = String(interaction.keyboard ?? "").toLowerCase();
  return valueType === "digit" || valueType === "digits" || valueType === "number" || keyboard === "number";
}

function operatorOnlyForInput(element: RendererElement): boolean {
  const interaction = asRecord(element.interaction);
  const valueType = String(interaction.value_type ?? "").toLowerCase();
  const keyboard = String(interaction.keyboard ?? "").toLowerCase();
  return valueType === "operator" || valueType === "comparison_operator" || keyboard === "operator";
}

function placeholderForInput(element: RendererElement): string | null {
  const interaction = asRecord(element.interaction);
  const explicit = String(interaction.placeholder ?? "").trim();
  if (explicit) return explicit;
  const text = String(element.text ?? "").trim();
  return text || null;
}

function compareByRowThenLeft(a: InputSlot, b: InputSlot): number {
  const rowDiff = Math.abs(a.rect.top - b.rect.top) < 12 ? 0 : a.rect.top - b.rect.top;
  return rowDiff !== 0 ? rowDiff : a.rect.left - b.rect.left;
}

function horizontalClusters(slots: InputSlot[]): InputSlot[][] {
  if (slots.length < 4) return [slots];
  const byLeft = [...slots].sort((a, b) => a.rect.left - b.rect.left);
  const avgWidth = byLeft.reduce((sum, s) => sum + s.rect.width, 0) / byLeft.length;
  const clusters: InputSlot[][] = [];
  let current: InputSlot[] = [byLeft[0]];
  let currentRight = byLeft[0].rect.left + byLeft[0].rect.width;

  for (let i = 1; i < byLeft.length; i++) {
    const slot = byLeft[i];
    const gap = slot.rect.left - currentRight;
    if (gap > avgWidth * 2.2) {
      clusters.push(current);
      current = [slot];
    } else {
      current.push(slot);
    }
    const right = slot.rect.left + slot.rect.width;
    if (right > currentRight) currentRight = right;
  }
  clusters.push(current);
  return clusters;
}

export function sortInputSlots(slots: InputSlot[]): InputSlot[] {
  const copy = [...slots];
  const ordered = copy.filter((s) => s.order !== null);
  const distinctOrders = new Set(ordered.map((s) => s.order));
  if (distinctOrders.size > 1) {
    copy.sort((a, b) => {
      if (a.order !== null && b.order !== null) {
        if (a.order !== b.order) return a.order - b.order;
      } else if (a.order !== null) {
        return -1;
      } else if (b.order !== null) {
        return 1;
      }
      return compareByRowThenLeft(a, b);
    });
    return copy;
  }

  const clusters = horizontalClusters(copy);
  if (clusters.length > 1) {
    return clusters.flatMap((cluster) => [...cluster].sort(compareByRowThenLeft));
  }
  copy.sort(compareByRowThenLeft);
  return copy;
}

function makeSlot(element: RendererElement, rect: RectBox, operatorOverride?: boolean): InputSlot {
  const attributes = asRecord(element.attributes);
  const interaction = asRecord(element.interaction);
  const id = String(element.id ?? "");
  const maxLength = maxLengthForInput(element);
  const order = readInt(interaction.order);
  const placeholder = placeholderForInput(element);
  const transform = String(attributes.transform ?? "");
  return {
    id,
    rect,
    contributesToAnswer: contributesToAnswer(element),
    maxLength,
    digitsOnly: digitsOnlyForInput(element),
    operatorOnly: operatorOverride ?? operatorOnlyForInput(element),
    autoAdvance: interaction.auto_advance === true,
    order,
    placeholder,
    transform,
    inputStyle: asRecord(element.input_style),
    signature: `${id}:${rect.left},${rect.top},${rect.width},${rect.height}:${maxLength}:${order ?? ""}:${placeholder ?? ""}:${transform}`,
  };
}

export function extractInputSlots(
  renderer: RendererData,
  options?: { expectedAnswer?: string; suppressInputs?: boolean },
): InputSlot[] {
  if (options?.suppressInputs) return [];
  const rawElements = renderer.elements;
  if (!Array.isArray(rawElements)) return [];

  const bindings =
    renderer.field_bindings && typeof renderer.field_bindings === "object"
      ? renderer.field_bindings
      : null;

  const slots: InputSlot[] = [];
  for (const element of rendererVisibleElements(rawElements)) {
    if (bindings && !Object.prototype.hasOwnProperty.call(bindings, String(element.id ?? ""))) {
      continue;
    }
    const type = String(element.type ?? "");
    const attributes = asRecord(element.attributes);

    if (type === "text_box" && looksLikeInputTextBox(element)) {
      const rect: RectBox = {
        left: readNumber(attributes.x) ?? 0,
        top: readNumber(attributes.y) ?? 0,
        width: readNumber(attributes.width) ?? readNumber(attributes.max_width) ?? 0,
        height: readNumber(attributes.height) ?? 0,
      };
      slots.push(makeSlot(element, rect));
      continue;
    }
    if (type === "circle" && looksLikeInputCircle(element)) {
      const cx = readNumber(attributes.cx) ?? 0;
      const cy = readNumber(attributes.cy) ?? 0;
      const r = readNumber(attributes.r) ?? 0;
      const expected = (options?.expectedAnswer ?? "").trim();
      const inferredOp = operatorOnlyForInput(element) || /^[<>=]+$/.test(expected);
      slots.push(makeSlot(element, { left: cx - r, top: cy - r, width: r * 2, height: r * 2 }, inferredOp));
      continue;
    }
    if (type === "path" && looksLikeInputPath(element)) {
      const rect = pathBounds(String(attributes.d ?? element.d ?? ""));
      if (rect) slots.push(makeSlot(element, rect));
      continue;
    }
    if (type === "rect") {
      const rect: RectBox = {
        left: readNumber(attributes.x) ?? 0,
        top: readNumber(attributes.y) ?? 0,
        width: readNumber(attributes.width) ?? 0,
        height: readNumber(attributes.height) ?? 0,
      };
      if (looksLikeInputRect(element, attributes, rect)) {
        slots.push(makeSlot(element, rect));
      }
    }
  }

  return sortInputSlots(slots);
}

export function inferSlotSliceLengths(slots: InputSlot[], value: string): number[] {
  if (slots.length === 0) return [];
  if (slots.length === 1) return [value.length];
  const totalMax = slots.reduce((sum, s) => sum + s.maxLength, 0);
  if (totalMax === value.length) {
    return slots.map((s) => s.maxLength);
  }
  const lengths: number[] = [];
  let remaining = value.length;
  for (const slot of slots) {
    const take = Math.max(0, Math.min(slot.maxLength, remaining));
    lengths.push(take);
    remaining -= take;
  }
  return lengths;
}

export function splitFieldValuesToSlots(
  slots: InputSlot[],
  bindings: Record<string, number> | undefined,
  fieldValues: string[],
): string[] {
  const result = new Array<string>(slots.length).fill("");
  if (!bindings) return result;
  for (let field = 0; field < fieldValues.length; field++) {
    const indexes: number[] = [];
    for (let i = 0; i < slots.length; i++) {
      if (bindings[slots[i].id] === field) indexes.push(i);
    }
    const val = fieldValues[field] ?? "";
    const lengths = inferSlotSliceLengths(
      indexes.map((i) => slots[i]),
      val,
    );
    let cursor = 0;
    for (let pos = 0; pos < indexes.length; pos++) {
      const end = Math.min(val.length, cursor + lengths[pos]);
      result[indexes[pos]] = val.slice(cursor, end);
      cursor = end;
    }
  }
  return result;
}

export function collectFieldValuesFromSlots(
  slots: InputSlot[],
  bindings: Record<string, number> | undefined,
  slotTexts: string[],
  fieldCount: number,
): string[] {
  const values = new Array<string>(fieldCount).fill("");
  if (!bindings) return values;
  for (let i = 0; i < slots.length; i++) {
    const field = bindings[slots[i].id];
    if (typeof field === "number" && field >= 0 && field < fieldCount) {
      values[field] += slotTexts[i] ?? "";
    }
  }
  return values;
}

export function boundedInputPadding(slot: InputSlot): number {
  const raw = readNumber(slot.inputStyle.padding) ?? 6;
  const maxPad = Math.min(slot.rect.width, slot.rect.height) * 0.12;
  return Math.max(0, Math.min(raw, maxPad));
}

export function computeSlotFontSize(
  slot: InputSlot,
  scale: number,
  displayLength: number,
): number {
  const style = slot.inputStyle;
  const authoredSize = readNumber(style.font_size);
  const minSize = readNumber(style.min_font_size);
  const maxSize = readNumber(style.max_font_size);
  const adjustment = readNumber(style.font_size_adjust) ?? 0;

  const padding = boundedInputPadding(slot);
  const type = String(style._value_type ?? "");
  const ratio =
    type === "digit"
      ? 0.58
      : type === "integer"
        ? 0.6
        : type === "decimal"
          ? 0.62
          : type === "fraction"
            ? 0.72
            : type === "text"
              ? 0.92
              : 0.7;

  const hint = slot.maxLength >= 64 ? (type === "integer" ? 3 : 1) : slot.maxLength;
  const characters = Math.max(1, Math.max(displayLength, hint));
  const byHeight = Math.max(1, slot.rect.height - 2 * padding) * 0.68;
  const byWidth = Math.max(1, slot.rect.width - 2 * padding) / characters / ratio;
  const fitLimit = Math.min(byHeight, byWidth);

  const preferred =
    style.font_size_mode === "fixed" && authoredSize !== null
      ? authoredSize
      : Math.max(minSize ?? 14, Math.min(maxSize ?? 52, fitLimit + adjustment));

  return Math.max(1, Math.min(preferred, Math.max(1, fitLimit))) * scale;
}

function isUnicodeWhitespace(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

function isZeroWidthOrCombining(code: number): boolean {
  return (
    code === 0x200b ||
    code === 0x200c ||
    code === 0x200d ||
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f)
  );
}

function isEastAsianWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function editorTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x09) units += 1.4;
    else if (isUnicodeWhitespace(code)) units += 0.35;
    else if (isZeroWidthOrCombining(code)) continue;
    else if (code >= 0x1780 && code <= 0x17ff) units += 1.05;
    else if (isEastAsianWide(code)) units += 0.9;
    else if ("ilI.,:;!'|()".includes(ch)) units += 0.32;
    else if (code >= 0x30 && code <= 0x39) units += 0.58;
    else if ("MWmw@".includes(ch)) units += 0.95;
    else units += 0.65;
  }
  return units * fontSize;
}

export function wrapRendererTextLikeEditor(
  text: string,
  maxWidth: number,
  fontSize: number,
): string {
  if (!text || maxWidth <= 0 || fontSize <= 0) return text;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    const tokens = paragraph.match(/[^\s]+\s*|\s+/g) ?? [];
    for (const token of tokens) {
      if (current && editorTextWidth(current + token, fontSize) > maxWidth) {
        lines.push(current.trimEnd());
        current = "";
      }
      for (const ch of token) {
        if (current && editorTextWidth(current + ch, fontSize) > maxWidth) {
          lines.push(current.trimEnd());
          current = "";
        }
        current += ch;
      }
    }
    lines.push(current.trimEnd());
  }
  return lines.join("\n");
}

export function isAnswerComplete(answer: unknown, fieldsCount: number): boolean {
  if (fieldsCount === 1 && Array.isArray(answer)) {
    return answer.length > 0 && answer.every((v) => v !== null && v !== undefined && String(v).trim() !== "");
  }
  const values = fieldsCount > 1 && Array.isArray(answer) ? answer : [answer];
  return (
    values.length === fieldsCount &&
    values.every((v) => v !== null && v !== undefined && (typeof v !== "string" || v.trim().length > 0))
  );
}

export function normalizeSubmissionAnswer(answer: unknown, fieldsCount: number): unknown {
  if (fieldsCount <= 1) {
    if (Array.isArray(answer)) {
      return answer.map((v) => (typeof v === "string" ? v.trim() : v));
    }
    return typeof answer === "string" ? answer.trim() : answer;
  }
  const list = Array.isArray(answer) ? answer : [answer];
  return Array.from({ length: fieldsCount }, (_, i) => {
    const v = list[i] ?? "";
    return typeof v === "string" ? v.trim() : v;
  });
}

export function buildGradingResult(
  locale: StudentLocale,
  correct: boolean | null,
  errorMessage?: string,
): GradingResultModel {
  if (errorMessage) {
    return { status: "error", correct: null, message: errorMessage };
  }
  if (correct === true) {
    return { status: "correct", correct: true, message: translateStudent(locale, "correct") };
  }
  if (correct === false) {
    return { status: "incorrect", correct: false, message: translateStudent(locale, "incorrect") };
  }
  return { status: "saved", correct: null, message: translateStudent(locale, "saved") };
}

export function displaySubmittedAnswer(
  item: NormalizedStudentItem,
  value: unknown,
  emptyLabel: string,
): string {
  if (value === null || value === undefined) return emptyLabel;
  const mapSingle = (v: unknown, fieldIndex: number): string => {
    const str = String(v ?? "");
    if (!str) return emptyLabel;
    const field = item.fields[fieldIndex] ?? item.fields[0];
    if (field) {
      const found = field.choices.find((c) => c.value === str || c.choice_id === str);
      if (found) return found.label;
    }
    const canvasChoice = item.canvasChoices.find((c) => c.value === str || c.choice_id === str);
    if (canvasChoice?.label) return canvasChoice.label;
    return str;
  };
  if (Array.isArray(value)) {
    if (value.length === 0) return emptyLabel;
    return value.map((v, i) => mapSingle(v, i)).join(", ");
  }
  const str = String(value);
  return str.trim() ? mapSingle(value, 0) : emptyLabel;
}

export function extractProblemSteps(
  problemId: string,
  solution: Record<string, unknown> | undefined,
): string[] {
  if (!solution) return [];
  const rawSteps = solution.steps;
  if (!Array.isArray(rawSteps)) return [];
  const suffixMatch = problemId.match(/_(\d+)$/);
  const subIndex = suffixMatch ? Number(suffixMatch[1]) : null;

  return rawSteps
    .filter((step) => {
      if (subIndex === null || !step || typeof step !== "object") return true;
      const obj = step as Record<string, unknown>;
      if (obj.subproblem !== undefined && obj.subproblem !== null) {
        return Number(obj.subproblem) === subIndex;
      }
      return true;
    })
    .map((step) => {
      if (typeof step === "string") return step.trim();
      const obj = asRecord(step);
      return String(obj.explanation ?? obj.text ?? obj.description ?? obj.expression ?? "").trim();
    })
    .filter((s) => s.length > 0);
}
