import React, { useState } from "react";
import { MathKeypad } from "./MathKeypad";
import { translateStudent } from "./strings";
import type { NormalizedStudentItem, StudentLocale } from "./types";

export interface AnswerInputPanelProps {
  item: NormalizedStudentItem;
  value: unknown;
  enabled: boolean;
  locale: StudentLocale;
  onChange: (nextValue: unknown) => void;
  onAnswerSelected?: (nextValue: unknown) => void;
}

export function AnswerInputPanel(props: AnswerInputPanelProps) {
  return <AnswerFields key={`${props.item.id}:${props.item.revision}`} {...props} />;
}

function AnswerFields({ item, value, enabled, locale, onChange, onAnswerSelected }: AnswerInputPanelProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const values = item.fields.length > 1 && Array.isArray(value) ? value : [value ?? ""];
  const activeField = enabled && activeIndex !== null ? item.fields[activeIndex] : undefined;

  const updateField = (index: number, nextVal: string, selected = false) => {
    const update = selected ? onAnswerSelected ?? onChange : onChange;
    update(item.fields.length === 1
      ? nextVal
      : item.fields.map((_, i) => i === index ? nextVal : values[i] ?? ""));
  };

  const fields = (
    <div className="modu-answer-panel modu-keypad-subject">
      {item.fields.map((field, index) => {
        const label = translateStudent(locale, "answer", { number: index + 1 });
        const current = String(values[index] ?? "");
        const open = enabled && activeIndex === index;
        const kind = field.maxLength !== null ? "digit" : field.type;
        const symbol = kind === "comparison_operator" || kind === "operator";
        const math = ["digit", "integer", "number", "decimal", "fraction", "expression"].includes(kind);

        return (
          <div key={`${field.id}-${index}`} className="modu-answer-field">
            <label htmlFor={field.choices.length ? undefined : `modu-panel-input-${item.id}-${index}`}>{label}</label>
            {field.choices.length > 0 ? (
              <div className="modu-panel-choices">
                {field.choices.map((choice, choiceIndex) => {
                  const multi = field.type === "multi_choice";
                  const selected = multi ? Array.isArray(value) && value.includes(choice.value) : current === choice.value;
                  return (
                    <button key={`${choice.value}-${choiceIndex}`} type="button"
                      className="modu-panel-choice" aria-pressed={selected}
                      data-testid={`panel-choice-${index}-${choiceIndex}`} disabled={!enabled}
                      onClick={() => {
                        if (multi) {
                          const previous = Array.isArray(value) ? value : [];
                          onChange(selected ? previous.filter((entry) => entry !== choice.value) : [...previous, choice.value]);
                        } else {
                          updateField(index, choice.value, true);
                        }
                      }}>
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="modu-answer-input-row">
                  {symbol ? (
                    <button type="button" className="modu-answer-input"
                      id={`modu-panel-input-${item.id}-${index}`}
                      disabled={!enabled} aria-expanded={open}
                      onClick={() => setActiveIndex(open ? null : index)}>
                      {current || translateStudent(locale, "write")}
                    </button>
                  ) : (
                    <input
                      id={`modu-panel-input-${item.id}-${index}`}
                      className="modu-answer-input"
                      data-testid={`assignment-answer-${index}`}
                      type="text"
                      inputMode={math ? "none" : "text"}
                      disabled={!enabled}
                      value={current}
                      placeholder={translateStudent(locale, "write")}
                      onFocus={() => setActiveIndex(math ? index : null)}
                      onClick={() => { if (math) setActiveIndex(index); }}
                      onKeyDown={(event) => { if (event.key === "Escape") setActiveIndex(null); }}
                      onChange={(event) => {
                        const next = event.target.value;
                        updateField(index, field.maxLength === null ? next : next.replace(/[^0-9]/g, "").slice(0, field.maxLength));
                      }}
                    />
                  )}
                  {item.unit && <span>{item.unit}</span>}
                  {!math && !symbol && (
                    <button type="button" className="modu-keypad-action"
                      aria-label={translateStudent(locale, "keypad")} aria-expanded={open} disabled={!enabled}
                      onClick={() => setActiveIndex(open ? null : index)}>⌨</button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="modu-keypad-layout">
      {fields}
      {activeIndex !== null && activeField && !activeField.choices.length && (
        <MathKeypad
          key={activeIndex}
          locale={locale}
          label={translateStudent(locale, "answer", { number: activeIndex + 1 })}
          kind={activeField.maxLength !== null ? "digit" : activeField.type}
          value={String(values[activeIndex] ?? "")}
          maxLength={activeField.maxLength}
          onClose={() => setActiveIndex(null)}
          onChange={(next) => {
            const symbol = activeField.type === "comparison_operator" || activeField.type === "operator";
            updateField(activeIndex, next, symbol);
            if (symbol) setActiveIndex(null);
          }}
        />
      )}
    </div>
  );
}
