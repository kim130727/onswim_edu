import type { InteractiveWidgetSpec } from "./widgets/types";

export type StudentLocale = "ko" | "uk";

export interface ChoiceOption {
  label: string;
  value: string;
  choice_id?: string;
}

export interface AssignmentField {
  id: string;
  type: string;
  label?: string;
  unit?: string;
  maxLength: number | null;
  displayLength?: number | null;
  choices: ChoiceOption[];
}

export interface CanvasChoiceSpec {
  choice_id?: string;
  value?: string;
  label?: string;
  element_ids?: string[];
}

export interface PresentationSpec {
  mode?: "canvas_slots" | "canvas_select" | "panel_input" | string;
  show_canvas?: boolean;
  canvas_bindings?: Record<string, number>;
  canvas_choices?: CanvasChoiceSpec[];
  multi?: boolean;
  [key: string]: unknown;
}

export interface RendererElement {
  id?: string;
  type?: string;
  text?: string;
  source_ref?: string;
  href?: string;
  src?: string;
  d?: string;
  points?: unknown;
  width?: number | string;
  height?: number | string;
  attributes?: Record<string, unknown>;
  interaction?: Record<string, unknown>;
  input_style?: Record<string, unknown>;
  widget?: InteractiveWidgetSpec;
  refs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RendererViewport {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  background?: string;
}

export interface RendererData {
  view_box?: RendererViewport;
  presentation_viewport?: RendererViewport;
  presentation_resolved?: boolean;
  field_bindings?: Record<string, number>;
  elements?: RendererElement[];
  [key: string]: unknown;
}

export interface StudentProblemContent {
  id?: number | string;
  problem_id?: string;
  title?: string;
  prompt?: string;
  revision?: string;
  language?: string;
  problem_type?: string;
  owner_name?: string;
  source_credit?: string;
  rights_note?: string;
  presentation?: PresentationSpec;
  input_schema?: {
    unit?: string;
    fields?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  semantic_data?: Record<string, unknown>;
  renderer_data?: RendererData;
  layout_data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AssignmentItemData {
  id: number;
  position: number;
  content: StudentProblemContent;
  draft_answer?: unknown;
  draft_updated_at?: string | null;
  submitted_answer?: unknown;
  last_submitted_at?: string | null;
  attempt_count: number;
  hint_total: number;
  revealed_hints: Array<Record<string, unknown>>;
  is_correct: boolean | null;
  answer?: unknown;
  solution?: Record<string, unknown>;
}

export interface NormalizedStudentItem {
  id: number | string;
  problemId: string;
  title: string;
  prompt: string;
  revision: string;
  language: string;
  problemType: string;
  ownerName: string;
  sourceCredit: string;
  rightsNote: string;
  presentation: PresentationSpec;
  canvasInputs: boolean;
  canvasSelect: boolean;
  canvasSelectMulti: boolean;
  canvasChoices: CanvasChoiceSpec[];
  showCanvas: boolean;
  unit: string;
  fields: AssignmentField[];
  semantic: Record<string, unknown>;
  renderer: RendererData;
  layout: Record<string, unknown>;
  rawContent: StudentProblemContent;
}

export interface RectBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InputSlot {
  id: string;
  rect: RectBox;
  contributesToAnswer: boolean;
  maxLength: number;
  digitsOnly: boolean;
  operatorOnly: boolean;
  autoAdvance: boolean;
  order: number | null;
  placeholder: string | null;
  transform: string;
  inputStyle: Record<string, unknown>;
  signature: string;
}

export interface GradingResultModel {
  status: "correct" | "incorrect" | "saved" | "error";
  correct: boolean | null;
  message: string;
}
