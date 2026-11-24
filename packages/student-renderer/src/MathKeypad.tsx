import React, { useState } from "react";
import { translateStudent } from "./strings";
import type { ChoiceOption, StudentLocale } from "./types";

const DIGITS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"];
const COMPARISONS = [">", "=", "<", "≥", "≤", "≠"];
const OPERATORS = ["+", "−", "×", "÷"];
const FRACTION_DRAFT = /^(-?(?:\d+ )?\d*)\/(\d*)$/;

interface MathKeypadProps {
  locale: StudentLocale;
  label: string;
  kind: string;
  value: string;
  maxLength?: number | null;
  choices?: ChoiceOption[];
  onChange: (value: string) => void;
  onClose: () => void;
}

export function MathKeypad({
  locale, label, kind, value, maxLength, choices, onChange, onClose,
}: MathKeypadProps) {
  const fractionText = value.normalize("NFKC").trim().replace(/−/g, "-").replace(/⁄/g, "/");
  const fraction = kind === "fraction"
    ? FRACTION_DRAFT.exec(fractionText) ?? FRACTION_DRAFT.exec(fractionText.replace(/\s*\/\s*/g, "/"))
    : null;
  const [part, setPart] = useState<0 | 1>(() => fraction?.[1] && !fraction[1].endsWith(" ") && !fraction[2] ? 1 : 0);
  const [whole, numerator, denominator] = fraction
    ? [fraction[1].slice(0, fraction[1].lastIndexOf(" ") + 1), fraction[1].split(" ").at(-1) ?? "", fraction[2]]
    : ["", "", ""];
  const singleSymbol = kind === "comparison_operator" || kind === "operator";
  const symbols = kind === "comparison_operator" ? COMPARISONS : OPERATORS;
  const options = choices?.length ? choices : symbols.map((symbol) => ({ label: symbol, value: symbol }));
  const t = (key: string) => translateStudent(locale, key);

  const change = (next: string) => {
    if (maxLength == null || next.length <= maxLength) onChange(next);
  };
  const editPart = (edit: (text: string) => string) => {
    if (!fraction) {
      change(edit(value));
      return;
    }
    change(part === 0 ? `${whole}${edit(numerator)}/${denominator}` : `${whole}${numerator}/${edit(denominator)}`);
  };
  const startFraction = () => {
    if (fraction) {
      setPart(part === 0 ? 1 : 0);
    } else if (/^-?(?:\d+ )?\d*$/.test(value)) {
      change(`${value}/`);
      setPart(value && !value.endsWith(" ") ? 1 : 0);
    }
  };

  return (
    <div className="modu-math-keypad" role="group" aria-label={`${label} · ${t("keypad")}`}
      onMouseDown={(event) => {
        // Pointer taps on typing keys leave the input focused for keyboard entry and Enter.
        if (!singleSymbol && event.button === 0 && document.activeElement instanceof HTMLInputElement &&
          event.target instanceof Element && event.target.closest("button:not(.modu-keypad-close)")) {
          event.preventDefault();
        }
      }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <button type="button" className="modu-keypad-action modu-keypad-close" onClick={onClose}>{t("keypadClose")}</button>
      {singleSymbol ? (
        <div className="modu-keypad-symbols">
          {options.map((option) => (
            <button key={option.value} type="button" className="modu-keypad-key"
              aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          {fraction && (
            <div className="modu-keypad-fraction-row">
              {whole && <span>{whole.trim()}</span>}
              <div className="modu-keypad-fraction">
                {[numerator, denominator].map((partValue, index) => {
                  const partLabel = t(index === 0 ? "keypadNumerator" : "keypadDenominator");
                  return (
                    <button key={index} type="button" className="modu-keypad-key"
                      aria-pressed={part === index} aria-label={`${partLabel} ${partValue}`.trim()}
                      onClick={() => setPart(index === 0 ? 0 : 1)}>
                      {partValue || partLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {denominator && !/[1-9]/.test(denominator) && (
            <div className="modu-keypad-error" role="status">{t("keypadZeroDenominator")}</div>
          )}
          <div className="modu-keypad-keys">
            {DIGITS.map((digit) => (
              <button key={digit} type="button" className="modu-keypad-key"
                onClick={() => editPart((text) => kind === "digit" && maxLength === 1 ? digit : text + digit)}>{digit}</button>
            ))}
            {kind === "fraction" && (
              <>
                <button type="button" className="modu-keypad-key" onClick={startFraction}>{t("keypadFraction")}</button>
                {!fraction && (
                  <button type="button" className="modu-keypad-key" disabled={!/^-?\d+$/.test(value)}
                    onClick={() => { change(`${value} /`); setPart(0); }}>{t("keypadMixedFraction")}</button>
                )}
              </>
            )}
            {kind === "fraction" && !fraction && (
              <button type="button" className="modu-keypad-key" disabled={value !== ""} onClick={() => change("-")}>−</button>
            )}
            {(kind === "number" || kind === "decimal" || kind === "integer") && (
              <>
                {kind !== "integer" && (
                  <button type="button" className="modu-keypad-key" disabled={value.includes(".")}
                    onClick={() => change(value + ".")}>.</button>
                )}
                <button type="button" className="modu-keypad-key" disabled={value !== ""} onClick={() => change("-")}>−</button>
              </>
            )}
            {(kind === "text" || kind === "expression") && [".", "/", ...OPERATORS, ...COMPARISONS, "(", ")", "%"].map((symbol) => (
              <button key={symbol} type="button" className="modu-keypad-key"
                onClick={() => change(value + symbol)}>{symbol}</button>
            ))}
          </div>
          <div className="modu-keypad-actions">
            <button type="button" className="modu-keypad-action" disabled={!value}
              onClick={() => { onChange(""); setPart(0); }}>{t("keypadClear")}</button>
            <button type="button" className="modu-keypad-action" disabled={!value}
              onClick={() => editPart((text) => text.slice(0, -1))}>⌫ {t("keypadBackspace")}</button>
          </div>
        </>
      )}
    </div>
  );
}
