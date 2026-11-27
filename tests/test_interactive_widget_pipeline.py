import pytest

from modu_math.renderer.compiler import compile_renderer_from_layout
from modu_math.renderer.models.primitive import RendererAST
from modu_math.renderer.validate import RendererValidationError, validate_renderer_json


def test_compile_and_validate_interactive_widget_slot():
    layout = {
        "schema": "modu.layout.v1",
        "problem_id": "widget_demo_001",
        "canvas": {"width": 928, "height": 480, "background": "#FFFFFF"},
        "regions": [{"id": "region.diagram", "role": "diagram", "flow": "free", "slot_ids": ["slot.voxel_1"]}],
        "slots": [
            {
                "id": "slot.voxel_1",
                "kind": "interactive_widget",
                "prompt": "3D 쌓기나무",
                "content": {
                    "x": 80,
                    "y": 60,
                    "width": 440,
                    "height": 280,
                    "widget": {
                        "kind": "voxel_3d",
                        "version": 1,
                        "mode": "sandbox",
                        "props": {
                            "baseBlocks": [[0, 0, 0], [0, 1, 0], [1, 0, 0]],
                            "extraBlocksLimit": 1,
                        },
                    },
                },
            }
        ],
    }

    doc = compile_renderer_from_layout(layout)
    payload = doc.to_dict()

    validate_renderer_json(payload)

    assert len(payload["elements"]) == 1
    el = payload["elements"][0]
    assert el["type"] == "interactive_widget"
    assert el["attributes"]["width"] == 440.0
    assert el["widget"]["kind"] == "voxel_3d"
    assert el["widget"]["props"]["extraBlocksLimit"] == 1

    # Round-trip through RendererAST
    ast = RendererAST.from_dict(payload)
    rt = ast.to_dict()
    assert rt["elements"][0]["widget"]["kind"] == "voxel_3d"


def test_validate_interactive_widget_requires_kind():
    invalid_payload = {
        "problem_id": "widget_invalid",
        "view_box": {"width": 640, "height": 360},
        "elements": [
            {
                "id": "w1",
                "type": "interactive_widget",
                "attributes": {"x": 0, "y": 0, "width": 300, "height": 200},
                "widget": {},
            }
        ],
    }
    with pytest.raises(RendererValidationError, match="widget.kind"):
        validate_renderer_json(invalid_payload)


def test_project_canvas_crops_viewport_for_interactive_widget():
    from modu_math_web.learning.services.canvas_presentation import project_canvas

    elements = [
        {
            "id": "w1",
            "type": "interactive_widget",
            "attributes": {"x": 220, "y": 180, "width": 380, "height": 240},
            "widget": {"kind": "solid_3d", "version": 1, "props": {}},
        },
        {
            "id": "ans1",
            "type": "rect",
            "attributes": {"x": 220, "y": 440, "width": 110, "height": 44},
            "interaction": {"type": "input", "role": "answer"},
        },
    ]
    kept, canvas = project_canvas(
        elements,
        {"canvas": {"width": 928, "height": 426}},
        {"width": 928, "height": 426},
        {"mode": "canvas_slots"},
        {"fields": [{"id": "answer", "type": "text", "choices": []}]},
        "문제를 입력하세요.",
    )
    assert len(kept) == 2
    assert canvas["viewport"] == {"x": 200.0, "y": 160.0, "width": 420.0, "height": 344.0}
