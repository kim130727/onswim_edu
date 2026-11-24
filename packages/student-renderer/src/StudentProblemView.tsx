import React, { useMemo } from "react";
import { AnswerInputPanel } from "./AnswerInputPanel";
import { prepareCanvasRenderer } from "./presentation";
import { RendererCanvas } from "./RendererCanvas";
import { translateStudent } from "./strings";
import type { NormalizedStudentItem, StudentLocale } from "./types";

export interface StudentProblemViewProps {
  item: NormalizedStudentItem;
  value: unknown;
  enabled: boolean;
  locale: StudentLocale;
  onChange: (nextValue: unknown) => void;
  onAnswerSelected?: (nextValue: unknown) => void;
  assetBaseUrl?: string;
  hidePanelInputs?: boolean;
}

/**
 * Unified student problem view shared across:
 * 1. Django `/student/` web app
 * 2. Capacitor mobile app (Android/iOS)
 * 3. Konva editor `앱처럼 풀어보기` preview
 */
export const StudentProblemView: React.FC<StudentProblemViewProps> = ({
  item,
  value,
  enabled,
  locale,
  onChange,
  onAnswerSelected,
  assetBaseUrl,
  hidePanelInputs = false,
}) => {
  const preparedRenderer = useMemo(() => prepareCanvasRenderer(item), [item]);

  const fieldValues = useMemo(() => {
    if (!item.canvasInputs) return null;
    return Array.from({ length: item.fields.length }, (_, i) => {
      if (item.fields.length === 1) {
        return value !== null && value !== undefined ? String(value) : "";
      }
      return Array.isArray(value) && i < value.length && value[i] != null
        ? String(value[i])
        : "";
    });
  }, [item.canvasInputs, item.fields.length, value]);

  const selectedChoices = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== null && entry !== undefined && String(entry) !== "") {
          set.add(String(entry));
        }
      }
    } else if (value !== null && value !== undefined && String(value) !== "") {
      set.add(String(value));
    }
    return set;
  }, [value]);

  const handleCanvasChoiceTap = (choiceValue: string) => {
    if (!enabled) return;
    if (item.canvasSelectMulti) {
      const next = new Set(selectedChoices);
      if (next.has(choiceValue)) {
        next.delete(choiceValue);
      } else {
        next.add(choiceValue);
      }
      onChange(next.size === 0 ? null : Array.from(next));
    } else {
      (onAnswerSelected ?? onChange)(choiceValue);
    }
  };

  const hasRendererElements =
    Array.isArray(preparedRenderer.elements) && preparedRenderer.elements.length > 0;
  const headingText = item.prompt || item.title;

  return (
    <div className="modu-student-problem-view" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {headingText && (
        <div
          className="modu-student-prompt"
          style={{
            fontSize: "var(--mm-problem-font-size)",
            lineHeight: 1.5,
            fontWeight: 700,
            color: "var(--mm-color-text-primary)",
            wordBreak: "keep-all",
            letterSpacing: "-0.01em",
          }}
        >
          {headingText}
        </div>
      )}

      {item.showCanvas && hasRendererElements && (
        <RendererCanvas
          key={`${item.id}:${item.revision}`}
          renderer={preparedRenderer}
          fieldValues={fieldValues}
          fields={item.fields}
          locale={locale}
          inputsEnabled={enabled}
          onFieldsChanged={(nextValues, selected) => {
            const update = selected ? onAnswerSelected ?? onChange : onChange;
            update(nextValues.length === 1 ? nextValues[0] : nextValues);
          }}
          canvasChoices={item.canvasSelect ? item.canvasChoices : []}
          selectedChoices={selectedChoices}
          onChoiceTap={item.canvasSelect ? handleCanvasChoiceTap : undefined}
          assetBaseUrl={assetBaseUrl}
        />
      )}

      {!hidePanelInputs && !item.canvasInputs && !item.canvasSelect && (
        <AnswerInputPanel
          item={item}
          value={value}
          enabled={enabled}
          locale={locale}
          onChange={onChange}
          onAnswerSelected={onAnswerSelected}
        />
      )}

      {(item.ownerName || item.sourceCredit || item.rightsNote) && (
        <div
          className="modu-student-credits"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: 12,
            fontSize: 12,
            color: "var(--mm-color-text-muted)",
            marginTop: 4,
          }}
        >
          {item.ownerName && (
            <span>
              {translateStudent(locale, "author")}: {item.ownerName}
            </span>
          )}
          {item.sourceCredit && (
            <span>
              {translateStudent(locale, "source")}: {item.sourceCredit}
            </span>
          )}
          {item.rightsNote && <span>{item.rightsNote}</span>}
        </div>
      )}
    </div>
  );
};
