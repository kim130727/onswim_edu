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
