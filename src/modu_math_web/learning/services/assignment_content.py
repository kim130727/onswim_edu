"""Answer-free input contracts and self-contained image snapshots."""

import base64
import mimetypes
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

from django.conf import settings
from rest_framework.exceptions import ValidationError

from ..math_answers import is_multi_choice_set, math_input_type


def answer_field_values(answer):
    keys = answer.get("answer_key")
    keys = keys if isinstance(keys, list) else []
    values = [key.get("value") if isinstance(key, dict) else key for key in keys]
    if values and values != [None]:
        return values
    raw_values = answer.get("values")
    if isinstance(raw_values, list) and raw_values:
        extracted = [item.get("value") if isinstance(item, dict) else item for item in raw_values]
        if extracted and extracted != [None]:
            return extracted
    val = answer.get("value")
    if isinstance(val, list) and val:
        return list(val)
    return [val]


def _answer_field_meta(problem, count):
    """Extract per-field label and unit metadata without leaking answer values."""
    answer = problem.answer if isinstance(problem.answer, dict) else {}
    semantic = getattr(problem, "semantic_data", None) or {}
    solvable = getattr(problem, "solvable_data", None) or {}
    ref_labels = {}
    for obj in (semantic.get("domain") or {}).get("objects") or []:
        if isinstance(obj, dict) and isinstance(obj.get("id"), str) and isinstance(obj.get("label"), str):
            ref_labels[obj["id"]] = obj["label"].strip()
    for unk in (solvable.get("understanding") or {}).get("unknowns") or []:
        if isinstance(unk, dict) and isinstance(unk.get("ref"), str) and isinstance(unk.get("label"), str):
            ref_labels.setdefault(unk["ref"], unk["label"].strip())

    raw_entries = answer.get("answer_key")
    if not isinstance(raw_entries, list) or not raw_entries:
        raw_entries = answer.get("values")
    if not isinstance(raw_entries, list):
        raw_entries = []

    default_unit = str(answer.get("unit") or "")
    meta = []
    for idx in range(count):
        entry = raw_entries[idx] if idx < len(raw_entries) and isinstance(raw_entries[idx], dict) else {}
        ref = entry.get("target_ref") or entry.get("ref") or entry.get("blank_id") or entry.get("id")
        label = str(entry.get("label") or (ref_labels.get(ref, "") if isinstance(ref, str) else "") or "").strip()
        unit = str(entry["unit"]) if "unit" in entry and entry["unit"] is not None else default_unit
        meta.append({"label": label, "unit": unit})
    return meta


def with_math_input_formats(schema, answer):
    """Expose math input formats and integer lengths without including answers."""
    values = answer_field_values(answer)
    fields = schema["fields"]
    if len(values) != len(fields):
        return schema
    formatted = []
    for field, value in zip(fields, values):
        raw_text = "" if value is None else str(value).strip()
        if field["type"] in {"number", "text"}:
            kind = math_input_type(value)
            if re.fullmatch(r"[0-9]+", raw_text):
                field = {**field, "type": "number", "max_length": len(raw_text)}
            elif kind != "text":
                field = {**field, "type": kind}
        if raw_text and "display_length" not in field:
            field = {**field, "display_length": len(raw_text)}
        formatted.append(field)
    return {**schema, "fields": formatted}


def input_schema(problem):
    answer = problem.answer
    keys = answer.get("answer_key") or []
    if not isinstance(keys, list):
        keys = []
    choices = (
        answer.get("choices")
        or problem.semantic_data.get("metadata", {}).get("choices")
        or []
    )
    safe_choices = []
    for index, choice in enumerate(choices if isinstance(choices, list) else []):
        if isinstance(choice, dict):
            label = choice.get("text", choice.get("label", ""))
            safe_choices.append(
                {"label": str(label), "value": choice.get("id", index + 1)}
            )
        elif isinstance(choice, str):
            safe_choices.append({"label": choice, "value": index + 1})
    fields = []
    choice_set = is_multi_choice_set(answer)
    if choice_set and safe_choices:
        return {
            "fields": [
                {"id": "field-1", "type": "multi_choice", "choices": safe_choices}
            ],
            "multiple": False,
            "unit": str(answer.get("unit") or ""),
        }
    expected_values = answer_field_values(answer)
    field_meta = _answer_field_meta(problem, len(expected_values))
    for index, expected in enumerate(expected_values):
        options = safe_choices
        if isinstance(expected, bool):
            options = [{"label": "O", "value": True}, {"label": "X", "value": False}]
        meta = field_meta[index]
        field_obj = {
            "id": f"field-{index + 1}",
            "type": "choice" if options else "text",
            "choices": options,
        }
        if meta["label"]:
            field_obj["label"] = meta["label"]
        if meta["unit"] != "" or len(expected_values) > 1:
            field_obj["unit"] = meta["unit"]
        fields.append(field_obj)
    return with_math_input_formats({
        "fields": fields,
        "multiple": len(fields) > 1,
        "unit": str(answer.get("unit") or ""),
    }, answer)


def validate_svg(data):
    if re.search(rb"<!DOCTYPE|<!ENTITY", data, re.IGNORECASE):
        raise ValidationError("외부 참조가 있는 SVG는 사용할 수 없습니다.")
    try:
        root = ElementTree.fromstring(data)
    except ElementTree.ParseError as exc:
        raise ValidationError("올바르지 않은 SVG입니다.") from exc
    if root.tag.split("}")[-1].lower() != "svg":
        raise ValidationError("올바르지 않은 SVG입니다.")
    for element in root.iter():
        if element.tag.split("}")[-1].lower() in {
            "script",
            "foreignobject",
            "iframe",
            "object",
            "embed",
        }:
            raise ValidationError("실행 콘텐츠가 있는 SVG는 사용할 수 없습니다.")
        for key, value in element.attrib.items():
            name = key.split("}")[-1].lower()
            if name.startswith("on"):
                raise ValidationError("실행 콘텐츠가 있는 SVG는 사용할 수 없습니다.")
            if name == "href" and not value.startswith(
                (
                    "#",
                    "data:image/png;base64,",
                    "data:image/jpeg;base64,",
                    "data:image/webp;base64,",
                )
            ):
                raise ValidationError("SVG의 이미지는 내부에 포함해야 합니다.")
        text = " ".join(element.attrib.values()) + (element.text or "")
        if "@import" in text.lower() or any(
            not value.strip(" '\"").startswith("#")
            for value in re.findall(r"url\((.*?)\)", text, re.IGNORECASE)
        ):
            raise ValidationError("SVG의 외부 참조는 사용할 수 없습니다.")


def freeze_images(content, problem, *, root=None):
    root = (root or settings.PROBLEMS_ROOT).resolve()
    relative = str(
        problem.catalog_data.get("path") or f"examples/problems/{problem.language}"
    )
    relative = relative.removeprefix("examples/problems/")
    directory = (root / relative).resolve()
    if not directory.is_relative_to(root):
        raise ValidationError("문제 이미지 경로가 올바르지 않습니다.")
    total = 0
    for element in content.get("renderer_data", {}).get("elements", []):
        if element.get("type") != "image":
            continue
        attrs = element.get("attributes", {})
        href = str(attrs.get("href") or "")
        if not href:
            continue
        if href.startswith("data:image/"):
            if not href.startswith(
                (
                    "data:image/png;base64,",
                    "data:image/jpeg;base64,",
                    "data:image/webp;base64,",
                    "data:image/svg+xml;base64,",
                )
            ):
                raise ValidationError(
                    "과제 이미지는 PNG, JPEG, WebP, SVG 형식이어야 합니다."
                )
            try:
                data = base64.b64decode(href.split(",", 1)[1], validate=True)
            except ValueError as exc:
                raise ValidationError("올바르지 않은 이미지입니다.") from exc
        else:
            parsed = urlsplit(href)
            if parsed.scheme or parsed.netloc:
                raise ValidationError(
                    "외부 이미지는 먼저 문제의 로컬 이미지로 등록해 주세요."
                )
            filename = unquote(parsed.path)
            if filename.startswith("/api/editor/assets/"):
                filename = filename.rsplit("/", 1)[-1]
            target = (directory / filename).resolve()
            if not target.is_relative_to(directory) or target.suffix.lower() not in {
                ".png",
                ".jpg",
                ".jpeg",
                ".webp",
                ".svg",
            }:
                raise ValidationError("허용되지 않은 문제 이미지 경로입니다.")
            if not target.is_file() or target.stat().st_size > 2 * 1024 * 1024:
                raise ValidationError("문제 이미지가 없거나 2MB를 초과합니다.")
            data = target.read_bytes()
            attrs["href"] = (
                f"data:{mimetypes.guess_type(target.name)[0]};base64,"
                + base64.b64encode(data).decode("ascii")
            )
        if href.startswith("data:image/svg+xml") or (
            not href.startswith("data:")
            and Path(urlsplit(href).path).suffix.lower() == ".svg"
        ):
            validate_svg(data)
        total += len(data)
        if len(data) > 2 * 1024 * 1024 or total > 8 * 1024 * 1024:
            raise ValidationError("문항의 이미지 용량 제한을 초과했습니다.")
    return content
