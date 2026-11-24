import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MathKeypad } from "./MathKeypad";
import { translateStudent } from "./strings";
import {
  asRecord,
  computeCanvasMetrics,
  elementVisualBounds,
  readNumber,
  resolveImageHref,
} from "./presentation";
import {
  boundedInputPadding,
  collectFieldValuesFromSlots,
  computeSlotFontSize,
  extractInputSlots,
  looksLikeInputTextBox,
  rendererVisibleElements,
  splitFieldValuesToSlots,
} from "./slots";
import type { AssignmentField, CanvasChoiceSpec, InputSlot, RendererData, RendererElement, StudentLocale } from "./types";

const FONT_STACK =
  '"Noto Sans KR", "Noto Sans", "Pretendard", "Segoe UI Symbol", "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function sanitizeFontFamily(raw: unknown): string {
  if (!raw) return FONT_STACK;
  const parts = String(raw)
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter((f) => f && !/poor\s*story/i.test(f));
  return parts.length > 0 ? `${parts.map((p) => `"${p}"`).join(", ")}, ${FONT_STACK}` : FONT_STACK;
}

function elementRenderPriority(el: RendererElement): number {
  const type = String(el.type ?? "").toLowerCase();
  if (type === "text" || type === "text_box" || type === "math") return 2;
  if (type === "line" || type === "connector") return 1;
  return 0;
}

function normalizePoints(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .filter((p): p is unknown[] => Array.isArray(p) && p.length >= 2)
      .map((p) => `${p[0]},${p[1]}`)
      .join(" ");
  }
  return "";
}

function normalizeTextContent(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\n+|\n+$/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");
}

function parseSvgTransformToCss(raw: string, scale: number): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const ops: string[] = [];
  const opRegex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = opRegex.exec(trimmed)) !== null) {
    const op = match[1].toLowerCase();
    const nums = (match[2].match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    if (op === "translate" && nums.length >= 1) {
      ops.push(`translate(${nums[0] * scale}px, ${(nums[1] ?? 0) * scale}px)`);
    } else if (op === "scale" && nums.length >= 1) {
      ops.push(`scale(${nums[0]}, ${nums[1] ?? nums[0]})`);
    } else if (op === "rotate" && nums.length >= 1) {
      if (nums.length >= 3) {
        const cx = nums[1] * scale;
        const cy = nums[2] * scale;
        ops.push(`translate(${cx}px, ${cy}px) rotate(${nums[0]}deg) translate(${-cx}px, ${-cy}px)`);
      } else {
        ops.push(`rotate(${nums[0]}deg)`);
      }
    } else if (op === "skewx" && nums.length >= 1) {
      ops.push(`skewX(${nums[0]}deg)`);
    } else if (op === "skewy" && nums.length >= 1) {
      ops.push(`skewY(${nums[0]}deg)`);
    } else if (op === "matrix" && nums.length >= 6) {
      ops.push(`matrix(${nums[0]}, ${nums[1]}, ${nums[2]}, ${nums[3]}, ${nums[4] * scale}, ${nums[5] * scale})`);
    }
  }
  return ops.length > 0 ? ops.join(" ") : undefined;
}

function CanvasTextBox({ element, scale }: { element: RendererElement; scale: number }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(1);
  const attributes = asRecord(element.attributes);
  const fontSize = readNumber(attributes["font-size"]) ?? 18;
  const fontFamily = sanitizeFontFamily(attributes["font-family"]);
  const fontWeight = String(attributes["font-weight"] ?? 400);
  const lineHeight = readNumber(attributes["data-line-height"]) ?? readNumber(attributes["line-height"]) ?? 1.35;
  const width = readNumber(attributes.width) ?? readNumber(attributes.max_width) ?? 860;
  const height = readNumber(attributes.height) ?? fontSize * lineHeight;
  const text = normalizeTextContent(element.text);
  const wrap = !text.includes("\n") && height >= fontSize * lineHeight * 1.7;
  const hAlign = attributes["data-text-align"] === "center" ? "center"
    : attributes["data-text-align"] === "right" ? "right" : "left";
  const vAlign = attributes["data-vertical-align"] === "middle" ? "center"
    : attributes["data-vertical-align"] === "bottom" ? "bottom" : "top";

  useLayoutEffect(() => {
    const span = textRef.current;
    if (!span) return;
    // Measure the unscaled layout so touch-screen zoom and authored transforms
    // never affect the font fitting or move a neighboring answer slot.
    const fitText = () => {
      const style = getComputedStyle(span);
      const measuredWidth = Math.max(span.scrollWidth, parseFloat(style.width) || 0);
      const measuredHeight = Math.max(span.scrollHeight, parseFloat(style.height) || 0);
      setFit(Math.min(1, width / (measuredWidth || width), height / (measuredHeight || height)));
    };
    fitText();
    // A fallback font can be replaced after layout. Watch the text itself.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fitText);
    observer.observe(span);
    return () => observer.disconnect();
  }, [fontFamily, fontSize, fontWeight, height, lineHeight, text, width, wrap]);

  const transform = parseSvgTransformToCss(String(attributes.transform ?? ""), scale);
  return (
    <div
      data-canvas-text-box={element.id}
      style={{
        position: "absolute",
        left: (readNumber(attributes.x) ?? 0) * scale,
        top: (readNumber(attributes.y) ?? 0) * scale,
        width,
        height,
        display: "flex",
        alignItems: vAlign === "center" ? "center" : vAlign === "bottom" ? "flex-end" : "flex-start",
        justifyContent: hAlign === "center" ? "center" : hAlign === "right" ? "flex-end" : "flex-start",
        pointerEvents: "none",
        transform: `${transform ? transform + " " : ""}scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
      <span
        ref={textRef}
        style={{
          flexShrink: 0,
          width: "max-content",
          maxWidth: wrap ? width : undefined,
          color: String(attributes.fill ?? "#000000"),
          fontSize,
          fontWeight,
          fontFamily,
          lineHeight,
          textAlign: hAlign,
          whiteSpace: wrap ? "break-spaces" : "pre",
          overflowWrap: wrap ? "anywhere" : undefined,
          transform: fit < 1 ? `scale(${fit})` : undefined,
          transformOrigin: `${hAlign} ${vAlign}`,
        }}
      >
        {text}
      </span>
    </div>
  );
}

export interface RendererCanvasProps {
  renderer: RendererData;
  fieldValues: string[] | null;
  inputsEnabled: boolean;
  fields?: AssignmentField[];
  locale?: StudentLocale;
  onFieldsChanged?: (values: string[], selected?: boolean) => void;
  canvasChoices?: CanvasChoiceSpec[];
  selectedChoices?: Set<string>;
  onChoiceTap?: (choiceValue: string) => void;
  assetBaseUrl?: string;
}

export const RendererCanvas: React.FC<RendererCanvasProps> = ({
  renderer,
  fieldValues,
  inputsEnabled,
  fields = [],
  locale = "ko",
  onFieldsChanged,
  canvasChoices = [],
  selectedChoices = new Set(),
  onChoiceTap,
  assetBaseUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(640);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const operatorRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const slots = useMemo(
    () => extractInputSlots(renderer, { suppressInputs: fieldValues === null }),
    [renderer, fieldValues],
  );
  const hasOperatorSlots = useMemo(() => slots.some((s) => s.operatorOnly), [slots]);

  const metrics = useMemo(
    () => computeCanvasMetrics(renderer, containerWidth, hasOperatorSlots ? 360 : 420),
    [renderer, containerWidth, hasOperatorSlots],
  );

  const bindings = renderer.field_bindings;
  const externalSlotTexts = useMemo(() => {
    if (!fieldValues) return [];
    return splitFieldValuesToSlots(slots, bindings, fieldValues);
  }, [slots, bindings, fieldValues]);

  const [slotTexts, setSlotTexts] = useState<string[]>(externalSlotTexts);
  const lastEmitted = useRef<string[] | null>(null);

  useEffect(() => {
    if (lastEmitted.current && fieldValues?.every((value, index) => value === lastEmitted.current?.[index])) {
      return;
    }
    lastEmitted.current = null;
    setSlotTexts(externalSlotTexts);
  }, [externalSlotTexts, fieldValues]);

  useEffect(() => {
    setActiveIndex(null);
  }, [renderer]);

  const emitSlotTexts = (nextTexts: string[], selected = false) => {
    setSlotTexts(nextTexts);
    if (fieldValues !== null && onFieldsChanged) {
      const nextFields = collectFieldValuesFromSlots(slots, bindings, nextTexts, fieldValues.length);
      lastEmitted.current = nextFields;
      onFieldsChanged(nextFields, selected);
    }
  };

  const handleSlotInput = (index: number, rawNext: string, advance = true) => {
    const slot = slots[index];
    if (!slot || !inputsEnabled) return;

    let filtered = rawNext;
    if (slot.digitsOnly) {
      filtered = filtered.replace(/[^0-9]/g, "");
    }

    const nextTexts = [...slotTexts];
    while (nextTexts.length < slots.length) nextTexts.push("");

    if (slot.digitsOnly && slot.maxLength === 1 && slot.autoAdvance && filtered.length > 1) {
      // Distribute multi-character / pasted digits across consecutive single-digit carry/answer slots.
      nextTexts[index] = filtered[0];
      let last = index;
      for (let offset = 1; offset < filtered.length; offset++) {
        const target = index + offset;
        if (target >= slots.length || !slots[target].digitsOnly || slots[target].maxLength !== 1) {
          break;
        }
        nextTexts[target] = filtered[offset];
        last = target;
      }
      emitSlotTexts(nextTexts);
      const nextFocus = Math.min(last + 1, slots.length - 1);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const clamped = filtered.slice(0, slot.maxLength);
    nextTexts[index] = clamped;
    emitSlotTexts(nextTexts);

    if (advance && slot.autoAdvance && clamped.length >= slot.maxLength && index + 1 < slots.length) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleSlotKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const slot = slots[index];
    if (!slot) return;
    if (e.key === "Escape") setActiveIndex(null);
    if (e.key === "Backspace" && !slotTexts[index] && index > 0 && slot.maxLength === 1) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const visibleElements = useMemo(() => {
    const visible = rendererVisibleElements(renderer.elements);
    return [...visible].sort((a, b) => elementRenderPriority(a) - elementRenderPriority(b));
  }, [renderer.elements]);

  const textBoxElements = useMemo(
    () =>
      visibleElements.filter(
        (el) => el.type === "text_box" && !looksLikeInputTextBox(el),
      ),
    [visibleElements],
  );

  const canvasChoiceOverlays = useMemo(() => {
    if (canvasChoices.length === 0) return [];
    const byId = new Map<string, RendererElement>();
    for (const el of renderer.elements ?? []) {
      if (el?.id) byId.set(String(el.id), el);
    }
    const entries: Array<{
      choice: CanvasChoiceSpec;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      basePad: number;
    }> = [];

    for (const choice of canvasChoices) {
      const boxes: Array<[number, number, number, number]> = [];
      let hasBareText = false;
      for (const id of choice.element_ids ?? []) {
        const el = byId.get(String(id));
        if (!el) continue;
        if (el.type === "text") hasBareText = true;
        const b = elementVisualBounds(el);
        if (b) boxes.push(b);
      }
      if (boxes.length === 0) continue;
      entries.push({
        choice,
        minX: Math.min(...boxes.map((b) => b[0])),
        minY: Math.min(...boxes.map((b) => b[1])),
        maxX: Math.max(...boxes.map((b) => b[2])),
        maxY: Math.max(...boxes.map((b) => b[3])),
        basePad: hasBareText ? 4 : 2.5,
      });
    }

    const minGap = 4;
    return entries.map((entry, i) => {
      let padLeft = entry.basePad;
      let padRight = entry.basePad;
      let padTop = entry.basePad;
      let padBottom = entry.basePad;

      for (let j = 0; j < entries.length; j++) {
        if (i === j) continue;
        const other = entries[j];
        const yOverlap = entry.minY < other.maxY && entry.maxY > other.minY;
        if (yOverlap) {
          if (other.minX >= entry.maxX) {
            padRight = Math.min(padRight, Math.max(0, (other.minX - entry.maxX - minGap) / 2));
          } else if (entry.minX >= other.maxX) {
            padLeft = Math.min(padLeft, Math.max(0, (entry.minX - other.maxX - minGap) / 2));
          }
        }
        const xOverlap = entry.minX < other.maxX && entry.maxX > other.minX;
        if (xOverlap) {
          if (other.minY >= entry.maxY) {
            padBottom = Math.min(padBottom, Math.max(0, (other.minY - entry.maxY - minGap) / 2));
          } else if (entry.minY >= other.maxY) {
            padTop = Math.min(padTop, Math.max(0, (entry.minY - other.maxY - minGap) / 2));
          }
        }
      }

      const rawWidth = (entry.maxX - entry.minX + padLeft + padRight) * metrics.scale;
      const rawHeight = (entry.maxY - entry.minY + padTop + padBottom) * metrics.scale;
      const width = Math.max(32, rawWidth);
      const height = Math.max(32, rawHeight);
      const rawLeft = (entry.minX - padLeft) * metrics.scale - (width - rawWidth) / 2;
      const rawTop = (entry.minY - padTop) * metrics.scale - (height - rawHeight) / 2;
      const frameLeft = metrics.originX * metrics.scale;
      const frameTop = metrics.originY * metrics.scale;
      const left = Math.max(frameLeft, Math.min(frameLeft + metrics.canvasWidth - width, rawLeft));
      const top = Math.max(frameTop, Math.min(frameTop + metrics.canvasHeight - height, rawTop));
      const choiceValue = String(entry.choice.value ?? entry.choice.choice_id ?? "");
      const choiceId = String(entry.choice.choice_id ?? "");
      const label = String(entry.choice.label ?? choiceValue);
      const selected =
        selectedChoices.has(choiceValue) || (choiceId !== "" && selectedChoices.has(choiceId));

      return { left, top, width, height, choiceValue, label, selected };
    });
  }, [
    canvasChoices,
    renderer.elements,
    metrics.scale,
    metrics.originX,
    metrics.originY,
    metrics.canvasWidth,
    metrics.canvasHeight,
    selectedChoices,
  ]);

  const fieldForSlot = (slot: InputSlot) => fields[bindings?.[slot.id] ?? -1];
  const kindForSlot = (slot: InputSlot): string => {
    const field = fieldForSlot(slot);
    const kind = String(slot.inputStyle._value_type ?? "");
    if (slot.operatorOnly) {
      return kind === "comparison_operator" || field?.type === "comparison_operator"
        ? "comparison_operator" : "operator";
    }
    if (slot.digitsOnly || field?.maxLength != null) return "digit";
    if (field && field.type !== "text") return field.type;
    return ["integer", "decimal", "number", "fraction", "expression"].includes(kind) ? kind : "text";
  };
  const activeSlot = activeIndex === null ? undefined : slots[activeIndex];
  const closeKeypad = () => {
    setActiveIndex(null);
    if (activeIndex !== null && activeSlot?.operatorOnly) operatorRefs.current[activeIndex]?.focus();
  };

  const canvas = (
    <div ref={containerRef} className="modu-keypad-subject">
      <div
        className="modu-student-canvas-frame"
        style={{
          width: metrics.canvasWidth,
          height: metrics.canvasHeight,
          margin: "0 auto",
          position: "relative",
          overflow: "hidden",
          background: metrics.background,
          border: "1px solid var(--mm-color-border-subtle)",
          borderRadius: "var(--mm-card-radius, 14px)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -metrics.originX * metrics.scale,
            top: -metrics.originY * metrics.scale,
            width: metrics.originalWidth * metrics.scale,
            height: metrics.originalHeight * metrics.scale,
          }}
        >
          {/* SVG Vector + Image + Text layer */}
          <svg
            width={metrics.originalWidth * metrics.scale}
            height={metrics.originalHeight * metrics.scale}
            viewBox={`0 0 ${metrics.originalWidth} ${metrics.originalHeight}`}
            style={{ display: "block", position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {visibleElements.map((el, idx) => {
              const a = asRecord(el.attributes);
              const key = `${el.id ?? el.type ?? "el"}-${idx}`;
              const transform = typeof a.transform === "string" ? a.transform : undefined;

              if (el.type === "image") {
                const rawHref = String(
                  a.href ?? a["xlink:href"] ?? a.src ?? a.url ?? a.path ?? el.href ?? el.src ?? "",
                ).trim();
                const href = resolveImageHref(rawHref, assetBaseUrl);
                const x = readNumber(a.x) ?? 0;
                const y = readNumber(a.y) ?? 0;
                const w = readNumber(a.width) ?? 0;
                const h = readNumber(a.height) ?? 0;
                if (!href || w <= 0 || h <= 0) return null;
                return (
                  <image
                    key={key}
                    href={href}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    preserveAspectRatio={href.includes("svg") ? "xMidYMid meet" : "none"}
                    transform={transform}
                  />
                );
              }

              if (el.type === "rect") {
                return (
                  <rect
                    key={key}
                    x={readNumber(a.x) ?? 0}
                    y={readNumber(a.y) ?? 0}
                    width={readNumber(a.width) ?? 0}
                    height={readNumber(a.height) ?? 0}
                    rx={readNumber(a.rx) ?? undefined}
                    ry={readNumber(a.ry) ?? undefined}
                    fill={String(a.fill ?? "none")}
                    stroke={String(a.stroke ?? "none")}
                    strokeWidth={readNumber(a["stroke-width"]) ?? 1}
                    strokeDasharray={a["stroke-dasharray"] ? String(a["stroke-dasharray"]) : undefined}
                    transform={transform}
                  />
                );
              }

              if (el.type === "circle") {
                return (
                  <circle
                    key={key}
                    cx={readNumber(a.cx) ?? 0}
                    cy={readNumber(a.cy) ?? 0}
                    r={readNumber(a.r) ?? 0}
                    fill={String(a.fill ?? "none")}
                    stroke={String(a.stroke ?? "none")}
                    strokeWidth={readNumber(a["stroke-width"]) ?? 1}
                    strokeDasharray={a["stroke-dasharray"] ? String(a["stroke-dasharray"]) : undefined}
                    transform={transform}
                  />
                );
              }

              if (el.type === "line") {
                const stroke = String(a.stroke ?? "#000000");
                if (stroke.toLowerCase() === "none") return null;
                return (
                  <line
                    key={key}
                    x1={readNumber(a.x1) ?? 0}
                    y1={readNumber(a.y1) ?? 0}
                    x2={readNumber(a.x2) ?? 0}
                    y2={readNumber(a.y2) ?? 0}
                    stroke={stroke}
                    strokeWidth={readNumber(a["stroke-width"]) ?? 1}
                    strokeLinecap="round"
                    strokeDasharray={a["stroke-dasharray"] ? String(a["stroke-dasharray"]) : undefined}
                    transform={transform}
                  />
                );
              }

              if (el.type === "polygon") {
                const pts = normalizePoints(a.points ?? el.points);
                if (!pts) return null;
                return (
                  <polygon
                    key={key}
                    points={pts}
                    fill={String(a.fill ?? "none")}
                    stroke={String(a.stroke ?? "none")}
                    strokeWidth={readNumber(a["stroke-width"]) ?? 1}
                    strokeLinejoin="round"
                    strokeDasharray={a["stroke-dasharray"] ? String(a["stroke-dasharray"]) : undefined}
                    transform={transform}
                  />
                );
              }

              if (el.type === "path") {
                const d = String(a.d ?? el.d ?? "");
                if (!d) return null;
                return (
                  <path
                    key={key}
                    d={d}
                    fill={String(a.fill ?? "none")}
                    stroke={String(a.stroke ?? "none")}
                    strokeWidth={readNumber(a["stroke-width"]) ?? 1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={a["stroke-dasharray"] ? String(a["stroke-dasharray"]) : undefined}
                    transform={transform}
                  />
                );
              }

              if (el.type === "text") {
                const text = normalizeTextContent(el.text);
                if (!text) return null;
                const x = readNumber(a.x) ?? 0;
                const y = readNumber(a.y) ?? 0;
                const fontSize = readNumber(a["font-size"]) ?? 18;
                const fill = String(a.fill ?? "#000000");
                const anchor = String(a["text-anchor"] ?? "start");
                const fontWeight = a["font-weight"] ? String(a["font-weight"]) : undefined;
                const lines = text.split("\n");
                return (
                  <text
                    key={key}
                    x={x}
                    y={y}
                    fill={fill}
                    fontSize={fontSize}
                    fontWeight={fontWeight}
                    fontFamily={sanitizeFontFamily(a["font-family"])}
                    textAnchor={anchor === "middle" || anchor === "end" ? anchor : "start"}
                    transform={transform}
                  >
                    {lines.length === 1
                      ? text
                      : lines.map((line, li) => (
                          <tspan key={li} x={x} dy={li === 0 ? 0 : fontSize * 1.25}>
                            {line}
                          </tspan>
                        ))}
                  </text>
                );
              }

              return null;
            })}
          </svg>

          {textBoxElements.map((element, index) => (
            <CanvasTextBox key={element.id ?? index} element={element} scale={metrics.scale} />
          ))}

          {/* Interactive Canvas Input Slots */}
          {slots.map((slot, index) => {
            const val = slotTexts[index] ?? "";
            const label = translateStudent(locale, "answer", { number: index + 1 });
            const shownValue = fieldForSlot(slot)?.choices.find((choice) => choice.value === val)?.label ?? val;
            const fontSize = computeSlotFontSize(slot, metrics.scale, [...shownValue].length);
            const inset = boundedInputPadding(slot) * metrics.scale;
            const left = slot.rect.left * metrics.scale + inset;
            const top = slot.rect.top * metrics.scale + inset;
            const width = Math.max(8, slot.rect.width * metrics.scale - inset * 2);
            const height = Math.max(8, slot.rect.height * metrics.scale - inset * 2);
            const cssTransform = parseSvgTransformToCss(slot.transform, metrics.scale);

            if (slot.operatorOnly) {
              const selected = activeIndex === index && inputsEnabled;
              return (
                <button
                  key={`op-slot-${slot.id || index}`}
                  type="button"
                  ref={(element) => { operatorRefs.current[index] = element; }}
                  className="modu-canvas-symbol"
                  data-testid={`operator-slot-${index}`}
                  data-slot-id={slot.id}
                  disabled={!inputsEnabled}
                  aria-label={shownValue ? `${label} ${shownValue}` : label}
                  aria-expanded={selected}
                  onClick={() => setActiveIndex(selected ? null : index)}
                  style={{
                    position: "absolute",
                    left,
                    top,
                    width,
                    height,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize,
                    fontWeight: 800,
                    color: "var(--mm-color-text-primary)",
                    fontFamily: FONT_STACK,
                    padding: 0,
                    cursor: inputsEnabled ? "pointer" : "default",
                    transform: cssTransform,
                    transformOrigin: "top left",
                  }}
                >
                  {shownValue || slot.placeholder || ""}
                </button>
              );
            }

            const hAlign = String(slot.inputStyle.horizontal_align ?? "center");
            const textColor =
              typeof slot.inputStyle.text_color === "string" && slot.inputStyle.text_color
                ? slot.inputStyle.text_color
                : "#1E1B4B";
            const fontWeight = readNumber(slot.inputStyle.font_weight) ?? 800;

            return (
              <input
                key={`input-slot-${slot.id || index}`}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                className="modu-canvas-input"
                inputMode={kindForSlot(slot) === "text" ? "text" : "none"}
                autoComplete="off"
                spellCheck={false}
                data-testid={`renderer-input-slot-${index}`}
                data-slot-id={slot.id}
                aria-label={label}
                data-keypad-open={activeIndex === index && inputsEnabled}
                disabled={!inputsEnabled}
                value={val}
                placeholder={slot.placeholder ?? ""}
                onFocus={(e) => {
                  setActiveIndex(kindForSlot(slot) === "text" ? null : index);
                  if (slot.maxLength === 1 && e.currentTarget.value.length > 0) {
                    e.currentTarget.select();
                  }
                }}
                onClick={(e) => {
                  if (kindForSlot(slot) !== "text") setActiveIndex(index);
                  if (slot.maxLength === 1 && e.currentTarget.value.length > 0) {
                    e.currentTarget.select();
                  }
                }}
                onChange={(e) => handleSlotInput(index, e.target.value)}
                onKeyDown={(e) => handleSlotKeyDown(index, e)}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width,
                  height,
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  margin: 0,
                  textAlign: hAlign === "left" ? "left" : hAlign === "right" ? "right" : "center",
                  fontSize,
                  fontWeight,
                  lineHeight: 1,
                  color: textColor,
                  fontFamily: FONT_STACK,
                  boxSizing: "border-box",
                  transform: cssTransform,
                  transformOrigin: "top left",
                }}
              />
            );
          })}

          {/* Interactive Canvas Choice Overlays (canvas_select) */}
          {canvasChoiceOverlays.map((c, idx) => (
            <button
              key={`choice-overlay-${c.choiceValue}-${idx}`}
              type="button"
              data-testid={`canvas-choice-${c.choiceValue}`}
              aria-pressed={c.selected}
              aria-label={c.label}
              disabled={!inputsEnabled}
              onClick={() => inputsEnabled && onChoiceTap?.(c.choiceValue)}
                style={{
                  position: "absolute",
                  left: c.left,
                  top: c.top,
                  width: c.width,
                  height: c.height,
                  borderRadius: 10,
                  border: c.selected
                    ? "3px solid var(--mm-canvas-choice-border-selected)"
                    : "1.5px solid var(--mm-canvas-choice-border)",
                  background: c.selected
                    ? "var(--mm-canvas-choice-bg-selected)"
                    : "var(--mm-canvas-choice-bg)",
                  boxSizing: "border-box",
                  margin: 0,
                  cursor: inputsEnabled ? "pointer" : "default",
                  padding: 0,
                  transition: "border-color var(--mm-motion-fast, 120ms) var(--mm-p-ease, ease), background-color var(--mm-motion-fast, 120ms) var(--mm-p-ease, ease)",
                }}
              >
                {c.selected && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 24,
                      height: 24,
                      borderRadius: "9999px",
                      background: "var(--mm-color-primary)",
                      color: "var(--mm-color-text-on-primary)",
                      fontSize: 14,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✓
                  </span>
                )}
            </button>
          ))}
        </div>
      </div>

    </div>
  );

  return (
    <div className="modu-student-canvas-root modu-keypad-layout">
      {canvas}
      {inputsEnabled && activeIndex !== null && activeSlot && (
        <MathKeypad
          key={activeSlot.id}
          locale={locale}
          label={translateStudent(locale, "answer", { number: activeIndex + 1 })}
          kind={kindForSlot(activeSlot)}
          value={slotTexts[activeIndex] ?? ""}
          choices={fieldForSlot(activeSlot)?.choices}
          maxLength={Math.min(activeSlot.maxLength, fieldForSlot(activeSlot)?.maxLength ?? Infinity)}
          onClose={closeKeypad}
          onChange={(next) => {
            if (activeSlot.operatorOnly) {
              const nextTexts = [...slotTexts];
              nextTexts[activeIndex] = next;
              emitSlotTexts(nextTexts, true);
              closeKeypad();
            } else {
              handleSlotInput(activeIndex, next, next.length > (slotTexts[activeIndex] ?? "").length || activeSlot.maxLength === 1);
            }
          }}
        />
      )}
    </div>
  );
};
