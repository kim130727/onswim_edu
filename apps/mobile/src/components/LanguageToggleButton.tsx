import React from "react";
import { translateStudent, type StudentLocale } from "@modu/student-renderer";

export interface LanguageToggleButtonProps {
  locale: StudentLocale;
  onChange: (next: StudentLocale) => void;
}

export const LanguageToggleButton: React.FC<LanguageToggleButtonProps> = ({ locale, onChange }) => {
  const nextLocale: StudentLocale = locale === "ko" ? "uk" : "ko";
  return (
    <button
      type="button"
      className="student-lang-toggle"
      data-testid="language-toggle"
      aria-label={translateStudent(locale, "languageLabel")}
      title={`${translateStudent(locale, "languageKorean")} / ${translateStudent(locale, "languageUkrainian")}`}
      onClick={() => onChange(nextLocale)}
    >
      {locale === "ko" ? "🇰🇷 KO" : "🇺🇦 UK"}
    </button>
  );
};
