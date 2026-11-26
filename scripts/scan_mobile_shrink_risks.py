from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "modu_math_web.settings")

import django  # noqa: E402

django.setup()

from modu_math_web.learning.services.assignment_content import input_schema  # noqa: E402
from modu_math_web.learning.services.canvas_presentation import (  # noqa: E402
    _safe_bounds,
    project_canvas,
)
from modu_math_web.learning.services.student_presentation import (  # noqa: E402
    presentation_contract,
    student_prompt,
)

MOBILE_WIDTH = 380.0


def load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def find_solvable(folder: Path, stem: str) -> dict[str, Any]:
    for suffix in (".solvable.v1.3.json", ".solvable.v1.2.json", ".solvable.v1.1.json", ".solvable.json"):
        candidate = folder / f"{stem}{suffix}"
        if candidate.is_file():
            return load_json(candidate)
    return {}


def extract_answer_payload(solvable: dict[str, Any], semantic: dict[str, Any]) -> dict[str, Any]:
    sem_answer = semantic.get("answer") if isinstance(semantic.get("answer"), dict) else {}
    sol_answer = solvable.get("answer") if isinstance(solvable.get("answer"), dict) else {}
    merged = {**sol_answer, **sem_answer}
    return merged


def read_font_size(el: dict[str, Any]) -> float | None:
    attrs = el.get("attributes") or {}
    raw = attrs.get("font-size")
    if isinstance(raw, (int, float)) and raw > 0:
        return float(raw)
    if isinstance(raw, str):
        try:
            v = float(raw.replace("px", "").strip())
            return v if v > 0 else None
        except ValueError:
            return None
    return None


def scan_all() -> dict[str, Any]:
    problems_root = ROOT / "examples" / "problems"
    renderer_files = sorted(problems_root.rglob("*.renderer.json"))

    p0_rows: list[dict[str, Any]] = []
    p1_rows: list[dict[str, Any]] = []
    p2_rows: list[dict[str, Any]] = []
    errors: list[str] = []
    total = 0

    for renderer_path in renderer_files:
        total += 1
        folder = renderer_path.parent
        stem = renderer_path.name[: -len(".renderer.json")]
        rel_dir = str(folder.relative_to(problems_root)).replace("\\", "/")

        try:
            renderer_data = load_json(renderer_path)
            layout_data = load_json(folder / f"{stem}.layout.json")
            semantic_data = load_json(folder / f"{stem}.semantic.json")
            solvable_data = find_solvable(folder, stem)
            answer_data = extract_answer_payload(solvable_data, semantic_data)
            problem_type = str(
                answer_data.get("type")
                or solvable_data.get("problem_type")
                or (semantic_data.get("metadata") or {}).get("problem_type")
                or ""
            )

            problem_obj = SimpleNamespace(
                id=stem,
                problem_id=stem,
                renderer_data=renderer_data,
                layout_data=layout_data,
                semantic_data=semantic_data,
                answer=answer_data,
                problem_type=problem_type,
            )

            schema = input_schema(problem_obj)
            presentation = presentation_contract(problem_obj, schema)
            prompt = student_prompt(problem_obj)
            mode = str(presentation.get("mode") or "")
            show_canvas = bool(presentation.get("show_canvas", True))

            elements = renderer_data.get("elements") or []
            view_box = renderer_data.get("view_box") or {"width": 928, "height": 426}
            kept_elements, proj_meta = project_canvas(elements, layout_data, view_box, presentation, schema, prompt)
            viewport = (proj_meta.get("viewport") if isinstance(proj_meta, dict) else None) or {
                "x": 0,
                "y": 0,
                "width": float(view_box.get("width", 928)),
                "height": float(view_box.get("height", 426)),
            }

            vp_w = max(1.0, float(viewport.get("width") or 928.0))
            vp_h = max(1.0, float(viewport.get("height") or 426.0))
            scale = MOBILE_WIDTH / vp_w

            by_id = {str(el.get("id")): el for el in elements if isinstance(el, dict) and el.get("id")}

            # Compute min touch height for canvas_slots / canvas_select
            touch_heights: list[float] = []
            if mode == "canvas_slots":
                for el_id in (presentation.get("canvas_bindings") or {}).keys():
                    el = by_id.get(str(el_id))
                    if not el:
                        continue
                    b = _safe_bounds(el)
                    if b:
                        touch_heights.append((b[3] - b[1]) * scale)
            elif mode == "canvas_select":
                for choice in presentation.get("canvas_choices") or []:
                    boxes = []
                    for el_id in choice.get("element_ids") or []:
                        el = by_id.get(str(el_id))
                        if el:
                            b = _safe_bounds(el)
                            if b:
                                boxes.append(b)
                    if boxes:
                        raw_h = max(b[3] for b in boxes) - min(b[1] for b in boxes)
                        touch_heights.append(raw_h * scale)

            min_touch_h = min(touch_heights) if touch_heights else None

            # P0 check
            if show_canvas and mode in {"canvas_select", "canvas_slots"}:
                reasons: list[str] = []
                if vp_w >= 680.0:
                    reasons.append(f"가로폭 {vp_w:.0f}px ≥ 680")
                if min_touch_h is not None and min_touch_h < 32.0:
                    reasons.append(f"터치 높이 {min_touch_h:.1f}px < 32")
                if reasons:
                    p0_rows.append(
                        {
                            "problem_id": stem,
                            "folder": rel_dir,
                            "mode": mode,
                            "vp_w": round(vp_w, 1),
                            "vp_h": round(vp_h, 1),
                            "scale": round(scale, 3),
                            "min_touch_h": round(min_touch_h, 1) if min_touch_h is not None else None,
                            "reason": ", ".join(reasons),
                        }
                    )

            # P1 check: canvas_select where all choice targets are pure text/text_box
            if show_canvas and mode == "canvas_select":
                choices = presentation.get("canvas_choices") or []
                if len(choices) >= 2:
                    all_text_only = True
                    sample_labels: list[str] = []
                    for choice in choices:
                        el_ids = choice.get("element_ids") or []
                        if not el_ids:
                            all_text_only = False
                            break
                        choice_texts: list[str] = []
                        for el_id in el_ids:
                            el = by_id.get(str(el_id))
                            if not el:
                                continue
                            etype = str(el.get("type") or "")
                            if etype not in {"text", "text_box"}:
                                all_text_only = False
                                break
                            t = str(el.get("text") or "").strip()
                            if t:
                                choice_texts.append(t)
                        if not all_text_only:
                            break
                        sample_labels.append(" ".join(choice_texts) or str(choice.get("label") or ""))
                    if all_text_only:
                        p1_rows.append(
                            {
                                "problem_id": stem,
                                "folder": rel_dir,
                                "vp_w": round(vp_w, 1),
                                "scale": round(scale, 3),
                                "choices_preview": " / ".join(sample_labels[:4]),
                            }
                        )

            # P2 check: kept text/text_box scaled font-size < 11px
            if show_canvas and kept_elements:
                scaled_fonts: list[tuple[float, float, str]] = []
                for el in kept_elements:
                    if el.get("type") not in {"text", "text_box"}:
                        continue
                    txt = str(el.get("text") or "").strip()
                    if not txt:
                        continue
                    fs = read_font_size(el)
                    if fs is not None:
                        scaled_fonts.append((fs * scale, fs, txt[:18]))
                if scaled_fonts:
                    min_scaled, raw_fs, sample_txt = min(scaled_fonts, key=lambda x: x[0])
                    if min_scaled < 11.0:
                        p2_rows.append(
                            {
                                "problem_id": stem,
                                "folder": rel_dir,
                                "mode": mode,
                                "vp_w": round(vp_w, 1),
                                "scale": round(scale, 3),
                                "raw_fs": round(raw_fs, 1),
                                "scaled_fs": round(min_scaled, 1),
                                "sample": sample_txt.replace("\n", " "),
                            }
                        )
        except Exception as exc:
            errors.append(f"{stem}: {exc}")

    p0_rows.sort(key=lambda r: (r["min_touch_h"] if r["min_touch_h"] is not None else 999.0, -r["vp_w"]))
    p1_rows.sort(key=lambda r: -r["vp_w"])
    p2_rows.sort(key=lambda r: r["scaled_fs"])

    return {
        "total": total,
        "p0": p0_rows,
        "p1": p1_rows,
        "p2": p2_rows,
        "errors": errors,
    }


def format_markdown(report: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# 모바일 축소 위험 문제 전수 스캔 리포트")
    lines.append("")
    lines.append(
        f"- 스캔 대상: `examples/problems/` 전체 **{report['total']}개** 문제 (기준 폭: **380px**, `scale = 380 / viewport.width`)"
    )
    lines.append(
        f"- **P0 (최우선)**: {len(report['p0'])}개 | **P1 (우선)**: {len(report['p1'])}개 | **P2 (참고)**: {len(report['p2'])}개 | 스캔 오류: {len(report['errors'])}개"
    )
    lines.append("")

    lines.append("## 1. 최우선 (P0): `canvas_select` / `canvas_slots` 가로폭 ≥ 680px 또는 터치 높이 < 32px")
    lines.append("")
    if report["p0"]:
        lines.append("| # | 문제 ID | 모드 | 크롭 폭(px) | 380px 배율 | 최소 터치 높이(px) | 사유 |")
        lines.append("|---:|---|---|---:|---:|---:|---|")
        for idx, r in enumerate(report["p0"], 1):
            th = f"{r['min_touch_h']}" if r["min_touch_h"] is not None else "-"
            lines.append(
                f"| {idx} | `{r['problem_id']}` | `{r['mode']}` | {r['vp_w']} | {r['scale']:.2f}× | {th} | {r['reason']} |"
            )
    else:
        lines.append("_해당 문제 없음_")
    lines.append("")

    lines.append("## 2. 우선 (P1): 단순 텍스트 보기 `canvas_select` (일반 `choice` 전환 권장)")
    lines.append("")
    if report["p1"]:
        lines.append("| # | 문제 ID | 크롭 폭(px) | 380px 배율 | 텍스트 보기 예시 |")
        lines.append("|---:|---|---:|---:|---|")
        for idx, r in enumerate(report["p1"], 1):
            lines.append(
                f"| {idx} | `{r['problem_id']}` | {r['vp_w']} | {r['scale']:.2f}× | {r['choices_preview']} |"
            )
    else:
        lines.append("_해당 문제 없음_")
    lines.append("")

    lines.append("## 3. 참고 (P2): 모바일 환산 본문 글자 크기 < 11px")
    lines.append("")
    if report["p2"]:
        lines.append("| # | 문제 ID | 모드 | 크롭 폭(px) | 원본 폰트(px) | 환산 폰트(px) | 텍스트 예시 |")
        lines.append("|---:|---|---|---:|---:|---:|---|")
        for idx, r in enumerate(report["p2"], 1):
            lines.append(
                f"| {idx} | `{r['problem_id']}` | `{r['mode']}` | {r['vp_w']} | {r['raw_fs']} | **{r['scaled_fs']}** | {r['sample']} |"
            )
    else:
        lines.append("_해당 문제 없음_")

    if report["errors"]:
        lines.append("")
        lines.append("## 스캔 오류")
        for err in report["errors"][:20]:
            lines.append(f"- {err}")

    return "\n".join(lines) + "\n"


def main() -> None:
    report = scan_all()
    md = format_markdown(report)
    out_path = ROOT / "docs" / "mobile_shrink_risk_report.md"
    out_path.write_text(md, encoding="utf-8")
    print(f"REPORT_WRITTEN={out_path}")
    print(f"TOTAL={report['total']} P0={len(report['p0'])} P1={len(report['p1'])} P2={len(report['p2'])} ERR={len(report['errors'])}")


if __name__ == "__main__":
    main()
