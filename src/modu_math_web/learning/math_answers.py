"""Input formats and equivalent notation for authored math answers."""

import re
import unicodedata


_SYMBOLS = str.maketrans({"−": "-", "×": "*", "÷": "/", "⁄": "/"})
_FRACTION = re.compile(r"(-?(?:[0-9]+ )?[0-9]+)\s*/\s*([0-9]+)")
_COMPARISONS = {">", "=", "<", "≤", "≥", "≠", ">=", "<=", "!="}


def math_input_type(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return "number"
    if not isinstance(value, str):
        return "text"
    value = " ".join(unicodedata.normalize("NFKC", value).translate(_SYMBOLS).split())
    if value in _COMPARISONS:
        return "comparison_operator"
    if value in {"+", "-", "*", "/"}:
        return "operator"
    if _FRACTION.fullmatch(value):
        return "fraction"
    if re.fullmatch(r"-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)", value):
        return "number"
    if re.fullmatch(r"[0-9.+*/<>=≤≥≠!%() -]+", value) and re.search(r"[0-9]", value):
        return "expression"
    return "text"


def same_math_notation(expected, submitted):
    if not isinstance(expected, str) or not isinstance(submitted, str):
        return False
    kind = math_input_type(expected)
    if kind == "text":
        return False

    def normalize(value):
        value = " ".join(unicodedata.normalize("NFKC", value).translate(_SYMBOLS).split())
        if kind == "fraction":
            match = _FRACTION.fullmatch(value)
            return "/".join(match.groups()) if match else None
        if kind == "expression":
            return re.sub(r"\s*([+*/<>=≤≥≠!%()-])\s*", r"\1", value)
        if kind == "comparison_operator":
            return {">=": "≥", "<=": "≤", "!=": "≠"}.get(value, value)
        return value

    return normalize(expected) == normalize(submitted)


def is_multi_choice_set(answer):
    """Return True when a flat choice list represents a single multi-select set."""
    if not isinstance(answer, dict):
        return False
    review = (answer.get("presentation") or {}).get("review") or {}
    if review.get("mode") == "grouped_choice":
        return False
    keys = answer.get("answer_key") or []
    keys = keys if isinstance(keys, list) else []
    if review.get("mode") in {"canvas_select", "choice"}:
        return len(keys) > 1
    if answer.get("type") in {"multi_choice", "multiple_choice_set", "multi_select"}:
        return True
    target = answer.get("target")
    if isinstance(target, dict) and target.get("type") in {
        "multiple_choice_set",
        "multiple_choice_values",
        "multi_choice",
    }:
        return True
    choices = answer.get("choices") or []
    if isinstance(choices, list) and len(choices) > len(keys) > 1:
        choice_ids = {
            ref
            for choice in choices
            if isinstance(choice, dict)
            for ref in (choice.get("id"), choice.get("slot_id"))
            if isinstance(ref, str) and ref
        }
        key_refs = [
            key.get("slot_id") or key.get("id")
            for key in keys
            if isinstance(key, dict)
        ]
        if (
            len(key_refs) == len(keys)
            and len(set(key_refs)) == len(keys)
            and all(
                isinstance(ref, str)
                and ref in choice_ids
                and not re.search(r"[._]g\d+_", ref)
                for ref in key_refs
            )
        ):
            return True
    return False
