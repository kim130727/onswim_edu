import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  computeCanvasMetrics,
  computeSlotFontSize,
  extractInputSlots,
  isAnswerComplete,
  normalizeProblemContent,
  normalizeSubmissionAnswer,
  prepareCanvasRenderer,
  projectVisualRenderer,
  resolveImageHref,
  StudentProblemView,
} from "@modu/student-renderer";

describe("shared student-renderer", () => {
  it("opens a comparison circle on demand and keeps the authored choice ID", () => {
    const item = normalizeProblemContent({
      presentation: { mode: "choice" },
      input_schema: { fields: [{
        type: "choice",
        choices: [ { label: ">", value: "greater" }, { label: "=", value: "equal" }, { label: "<", value: "less" } ],
      }] },
      renderer_data: { elements: [{
        id: "circle",
        type: "circle",
        attributes: { cx: 65, cy: 40, r: 25 },
        interaction: { type: "select", role: "choice", include_in_submission: true },
      }] },
    });
    const onChange = vi.fn();
    const view = (value: string) => <StudentProblemView item={item} value={value} enabled locale="ko" onChange={onChange} />;
    const { rerender } = render(view(""));
    const circle = screen.getByRole("button", { name: "답 1" });
    expect(screen.queryByRole("button", { name: "=" })).not.toBeInTheDocument();
    fireEvent.click(circle);
    expect(circle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "=" }));
    expect(onChange).toHaveBeenLastCalledWith("equal");
    expect(circle).toHaveTextContent("=");
    expect(circle).toHaveAttribute("aria-expanded", "false");
    rerender(view("less"));
    expect(circle).toHaveTextContent("<");
  });

  it("edits fraction parts and validates the answer before submission", () => {
    const item = normalizeProblemContent({
      input_schema: { fields: [{ id: "answer", type: "fraction" }] },
    });
    function Problem() {
      const [value, setValue] = useState<unknown>("");
      return <>
        <StudentProblemView item={item} value={value} enabled locale="ko" onChange={setValue} />
        <button disabled={!isAnswerComplete(value, item.fields)}>제출</button>
      </>;
    }
    render(<Problem />);
    const input = screen.getByRole("textbox", { name: "답 1" });
    const submit = screen.getByRole("button", { name: "제출" });
    fireEvent.click(input);
    fireEvent.click(screen.getByRole("button", { name: "분수" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "분모" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    expect(input).toHaveValue("3/0");
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "⌫ 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(input).toHaveValue("3/4");
    expect(submit).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("group", { name: "답 1 · 수학 키패드" })).not.toBeInTheDocument();
    fireEvent.click(input);
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "대분수" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "분모" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(input).toHaveValue("1 2/3");
    expect(submit).toBeEnabled();
  });

  it("supports whole-answer capacity fallback without truncating pasted values", () => {
    const raw = {
      id: 10,
      problem_id: "P3_1_01_00040_00472",
      prompt: "계산해 보세요.",
      presentation: {
        mode: "canvas_slots",
        show_canvas: true,
        canvas_bindings: { slot_ans: 0 },
      },
      input_schema: {
        fields: [{ id: "answer", type: "number" }],
      },
      renderer_data: {
        view_box: { width: 928, height: 426 },
        elements: [
          {
            id: "slot_ans",
            type: "rect",
            attributes: { x: 200, y: 120, width: 120, height: 48, stroke: "#111", fill: "#fff" },
            interaction: { type: "input", role: "answer", value_type: "integer", max_length: 1, auto_advance: true },
          },
        ],
      },
    };
    const item = normalizeProblemContent(raw);
    const onChange = vi.fn();
    render(
      <StudentProblemView item={item} value="" enabled={true} locale="ko" onChange={onChange} />,
    );
    const input = screen.getByTestId("renderer-input-slot-0") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "123456789" } });
    expect(onChange).toHaveBeenLastCalledWith("123456789");
  });

  it("handles vertical arithmetic carry + answer single-digit slots with distribution and order", () => {
    const raw = {
      id: 20,
      problem_id: "P3_1_01_00040_02135",
      prompt: "세로셈을 계산하세요.",
      presentation: {
        mode: "canvas_slots",
        show_canvas: true,
        canvas_bindings: {
          carry_1: 0,
          carry_2: 0,
          ans_1: 1,
          ans_2: 1,
          ans_3: 1,
        },
      },
      input_schema: {
        fields: [
          { id: "carry", type: "number" },
          { id: "answer", type: "number" },
        ],
      },
      renderer_data: {
        view_box: { width: 400, height: 300 },
        elements: [
          {
            id: "ans_3",
            type: "rect",
            attributes: { x: 220, y: 180, width: 22, height: 22, stroke: "#111", fill: "#fff" },
            interaction: { type: "input", role: "answer", value_type: "digit", max_length: 1, auto_advance: true, order: 5 },
          },
          {
            id: "carry_1",
            type: "rect",
            attributes: { x: 160, y: 40, width: 19, height: 19, stroke: "#111", fill: "#fff" },
            interaction: { type: "input", role: "carry", value_type: "digit", max_length: 1, auto_advance: true, order: 1 },
          },
          {
            id: "carry_2",
            type: "rect",
            attributes: { x: 190, y: 40, width: 19, height: 19, stroke: "#111", fill: "#fff" },
            interaction: { type: "input", role: "carry", value_type: "digit", max_length: 1, auto_advance: true, order: 2 },
          },
          {
            id: "ans_1",
            type: "rect",
            attributes: { x: 160, y: 180, width: 22, height: 22, stroke: "#111", fill: "#fff" },
            interaction: { type: "input", role: "answer", value_type: "digit", max_length: 1, auto_advance: true, order: 3 },
          },
          {
            id: "ans_2",
            type: "rect",
            attributes: { x: 190, y: 180, width: 22, height: 22, stroke: "#111", fill: "#fff" },
            interaction: { type: "input", role: "answer", value_type: "digit", max_length: 1, auto_advance: true, order: 4 },
          },
        ],
      },
    };
    const item = normalizeProblemContent(raw);
    const prepared = prepareCanvasRenderer(item);
    const slots = extractInputSlots(prepared);
    expect(slots.map((s) => s.id)).toEqual(["carry_1", "carry_2", "ans_1", "ans_2", "ans_3"]);

    // Verify small carry cell font size never clips cell height
    const carryFont = computeSlotFontSize(slots[0], 1, 1);
    expect(carryFont).toBeLessThanOrEqual(19);
    expect(carryFont).toBeGreaterThan(5);

    // Verify mobile vs desktop responsive canvas scaling
    const mobileMetrics = computeCanvasMetrics(prepared, 360);
    const desktopMetrics = computeCanvasMetrics(prepared, 900);
    expect(mobileMetrics.canvasWidth).toBeLessThanOrEqual(360);
    expect(desktopMetrics.canvasWidth).toBeGreaterThan(mobileMetrics.canvasWidth);

    const onChange = vi.fn();
    render(
      <StudentProblemView item={item} value={["", ""]} enabled={true} locale="ko" onChange={onChange} />,
    );
    const firstSlot = screen.getByTestId("renderer-input-slot-0");
    fireEvent.change(firstSlot, { target: { value: "11921" } });
    expect(onChange).toHaveBeenLastCalledWith(["11", "921"]);
    expect(isAnswerComplete(["11", "921"], 2)).toBe(true);
    expect(isAnswerComplete(["11", ""], 2)).toBe(false);
    expect(normalizeSubmissionAnswer([" 11 ", " 921 "], 2)).toEqual(["11", "921"]);
  });

  it("supports panel multiple choice and canvas_select choices", () => {
    const panelItem = normalizeProblemContent({
      id: 30,
      prompt: "옳은 것을 고르세요.",
      presentation: { mode: "panel_input", show_canvas: false },
      input_schema: {
        fields: [
          {
            id: "choice",
            type: "choice",
            choices: [
              { label: "(1) 10", value: "1" },
              { label: "(2) 20", value: "2" },
              { label: "(3) 60 × 4", value: "3" },
            ],
          },
        ],
      },
    });
    const onPanelChange = vi.fn();
    render(
      <StudentProblemView item={panelItem} value={null} enabled={true} locale="ko" onChange={onPanelChange} />,
    );
    fireEvent.click(screen.getByText("(3) 60 × 4"));
    expect(onPanelChange).toHaveBeenCalledWith("3");

    const canvasItem = normalizeProblemContent({
      id: 31,
      prompt: "그림에서 고르세요.",
      presentation: {
        mode: "canvas_select",
        show_canvas: true,
        canvas_choices: [
          { choice_id: "c1", value: "1", label: "보기 1", element_ids: ["r1"] },
          { choice_id: "c2", value: "2", label: "보기 2", element_ids: ["r2"] },
        ],
      },
      renderer_data: {
        view_box: { width: 400, height: 200 },
        elements: [
          { id: "r1", type: "rect", attributes: { x: 20, y: 20, width: 80, height: 60, stroke: "#111", fill: "#fff" } },
          { id: "r2", type: "rect", attributes: { x: 140, y: 20, width: 80, height: 60, stroke: "#111", fill: "#fff" } },
        ],
      },
    });
    const onCanvasChoice = vi.fn();
    render(
      <StudentProblemView item={canvasItem} value={null} enabled={true} locale="ko" onChange={onCanvasChoice} />,
    );
    fireEvent.click(screen.getByTestId("canvas-choice-2"));
    expect(onCanvasChoice).toHaveBeenCalledWith("2");
  });

  it("projects visual renderer removing duplicate prompt while preserving diagram labels and resolving relative images", () => {
    const item = normalizeProblemContent({
      id: 40,
      prompt: "사과가 모두 몇 개인가요?",
      renderer_data: {
        view_box: { width: 800, height: 400 },
        elements: [
          {
            id: "q1",
            type: "text",
            text: "사과가 모두 몇 개인가요?",
            attributes: { x: 20, y: 30, "font-size": 20, "data-semantic-role": "question" },
          },
          {
            id: "img1",
            type: "image",
            attributes: { x: 100, y: 100, width: 120, height: 120, href: "apples.png" },
          },
          {
            id: "lb1",
            type: "text",
            text: "3개",
            attributes: { x: 160, y: 240, "font-size": 16, "data-semantic-role": "diagram_label" },
          },
        ],
      },
    });

    const projected = projectVisualRenderer(item);
    expect(projected.elements?.map((e) => e.id)).toEqual(["img1", "lb1"]);
    expect(projected.presentation_viewport).toBeDefined();
    expect(resolveImageHref("apples.png", "http://127.0.0.1:8000/api/v1/problems/40/asset")).toBe(
      "http://127.0.0.1:8000/api/v1/problems/40/asset/apples.png",
    );
    expect(resolveImageHref("/api/v1/problems/40/asset/?name=apples.png", "http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000/api/v1/problems/40/asset/?name=apples.png",
    );
    expect(resolveImageHref("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});
