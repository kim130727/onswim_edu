import React, { useState } from "react";
import { translateStudent } from "./strings";
import type { NormalizedStudentItem, StudentLocale } from "./types";

export interface AnswerInputPanelProps {
  item: NormalizedStudentItem;
  value: unknown;
  enabled: boolean;
  locale: StudentLocale;
  onChange: (nextValue: unknown) => void;
}

const KEYPAD_DIGITS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "/"];

export const AnswerInputPanel: React.FC<AnswerInputPanelProps> = ({
  item,
  value,
  enabled,
  locale,
  onChange,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [keypadOpen, setKeypadOpen] = useState(false);

  const values: unknown[] =
    item.fields.length > 1
      ? Array.isArray(value)
        ? [...value]
        : new Array(item.fields.length).fill("")
      : [value ?? ""];

  const updateField = (index: number, nextVal: unknown) => {
    const next = [...values];
    while (next.length < item.fields.length) next.push("");
    next[index] = nextVal;
    onChange(item.fields.length === 1 ? nextVal : next);
  };

  const handleKeypadAppend = (keyText: string) => {
    const field = item.fields[activeIndex];
    if (!field || !enabled) return;
    const current = String(values[activeIndex] ?? "");
    const next = current + keyText;
    if (field.maxLength !== null && (next.length > field.maxLength || !/^[0-9]+$/.test(next))) {
      return;
    }
    updateField(activeIndex, next);
  };

  const handleKeypadBackspace = () => {
    if (!enabled) return;
    const current = String(values[activeIndex] ?? "");
    if (current.length > 0) {
      updateField(activeIndex, current.slice(0, -1));
    }
  };

  const handleKeypadClear = () => {
    if (!enabled) return;
    updateField(activeIndex, "");
  };

  return (
    <div className="modu-answer-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {item.fields.map((field, idx) => {
        const label = translateStudent(locale, "answer", { number: idx + 1 });

        if (field.choices.length > 0) {
          const isMulti = field.type === "multi_choice";
          return (
            <div key={`${field.id}-${idx}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1E1B4B" }}>{label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {field.choices.map((choice, cIdx) => {
                  const selected = isMulti
                    ? Array.isArray(value) && value.includes(choice.value)
                    : String(values[idx] ?? "") === choice.value;

                  return (
                    <button
                      key={`${choice.value}-${cIdx}`}
                      type="button"
                      role="button"
                      aria-pressed={selected}
                      data-testid={`panel-choice-${idx}-${cIdx}`}
                      disabled={!enabled}
                      onClick={() => {
                        if (!enabled) return;
                        if (isMulti) {
                          const prev = Array.isArray(value) ? [...value] : [];
                          const next = prev.includes(choice.value)
                            ? prev.filter((v) => v !== choice.value)
                            : [...prev, choice.value];
                          onChange(next);
                        } else {
                          updateField(idx, choice.value);
                        }
                      }}
                      style={{
                        minWidth: 64,
                        minHeight: "var(--mm-touch-min, 48px)",
                        padding: "10px 20px",
                        borderRadius: "var(--mm-p-radius-pill, 9999px)",
                        border: `1.5px solid ${selected ? "var(--mm-choice-border-selected)" : "var(--mm-choice-border)"}`,
                        background: selected ? "var(--mm-choice-bg-selected)" : "var(--mm-choice-bg)",
                        color: selected ? "var(--mm-choice-text-selected)" : "var(--mm-choice-text)",
                        fontSize: "clamp(1rem, 2vw, 1.125rem)",
                        fontWeight: 600,
                        cursor: enabled ? "pointer" : "default",
                        opacity: !enabled && !selected ? 0.6 : 1,
                        transition: "all var(--mm-motion-fast, 120ms) var(--mm-p-ease, ease)",
                      }}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        const currentText = String(values[idx] ?? "");
        return (
          <div key={`${field.id}-${idx}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor={`modu-panel-input-${item.id}-${idx}`}
              style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B" }}
            >
              {label}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id={`modu-panel-input-${item.id}-${idx}`}
                data-testid={`assignment-answer-${idx}`}
                type="text"
                inputMode={field.maxLength !== null || field.type === "number" ? "decimal" : "text"}
                disabled={!enabled}
                value={currentText}
                placeholder={translateStudent(locale, "write")}
                onFocus={() => setActiveIndex(idx)}
                onChange={(e) => {
                  let next = e.target.value;
                  if (field.maxLength !== null) {
                    next = next.replace(/[^0-9]/g, "").slice(0, field.maxLength);
                  }
                  updateField(idx, next);
                }}
                style={{
                  flex: 1,
                  minHeight: "var(--mm-touch-min, 48px)",
                  fontSize: "clamp(1.25rem, 2.5vw, 1.4rem)",
                  fontWeight: 600,
                  padding: "10px 14px",
                  borderRadius: "var(--mm-input-radius, 10px)",
                  border: "1.5px solid var(--mm-input-border)",
                  color: "var(--mm-color-text-primary)",
                  background: enabled ? "var(--mm-input-bg)" : "var(--mm-color-disabled-bg)",
                }}
              />
              {item.unit && (
                <span style={{ fontSize: 18, fontWeight: 600, color: "var(--mm-color-text-secondary)" }}>{item.unit}</span>
              )}
              <button
                type="button"
                title={translateStudent(locale, "keypad")}
                aria-label={translateStudent(locale, "keypad")}
                aria-pressed={keypadOpen}
                disabled={!enabled}
                onClick={() => {
                  setActiveIndex(idx);
                  setKeypadOpen((prev) => !prev);
                }}
                style={{
                  minWidth: "var(--mm-touch-min, 48px)",
                  minHeight: "var(--mm-touch-min, 48px)",
                  borderRadius: "var(--mm-btn-radius, 10px)",
                  border: "1.5px solid var(--mm-color-border-strong)",
                  background: keypadOpen ? "var(--mm-color-primary-soft)" : "var(--mm-color-bg-surface)",
                  color: "var(--mm-color-primary)",
                  fontSize: 18,
                  cursor: enabled ? "pointer" : "default",
                }}
              >
                ⌨
              </button>
            </div>
          </div>
        );
      })}

      {keypadOpen && enabled && (
        <div
          className="modu-math-keypad"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            padding: 12,
            borderRadius: 14,
            border: "1px solid #E1E5F2",
            background: "#F8FAFF",
            maxWidth: 320,
          }}
        >
          {KEYPAD_DIGITS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => handleKeypadAppend(k)}
              style={{
                height: 44,
                borderRadius: 10,
                border: "1px solid #CBD5E1",
                background: "#FFFFFF",
                fontSize: 20,
                fontWeight: 700,
                color: "#1E1B4B",
                cursor: "pointer",
              }}
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={handleKeypadClear}
            style={{
              height: 44,
              borderRadius: 10,
              border: "1px solid #CBD5E1",
              background: "#FEF2F2",
              fontSize: 14,
              fontWeight: 700,
              color: "#DC2626",
              cursor: "pointer",
            }}
          >
            {translateStudent(locale, "keypadClear")}
          </button>
          <button
            type="button"
            onClick={handleKeypadBackspace}
            style={{
              gridColumn: "span 2",
              height: 44,
              borderRadius: 10,
              border: "1px solid #CBD5E1",
              background: "#EEF2FF",
              fontSize: 14,
              fontWeight: 700,
              color: "#4F46E5",
              cursor: "pointer",
            }}
          >
            ⌫ {translateStudent(locale, "keypadBackspace")}
          </button>
        </div>
      )}
    </div>
  );
};
