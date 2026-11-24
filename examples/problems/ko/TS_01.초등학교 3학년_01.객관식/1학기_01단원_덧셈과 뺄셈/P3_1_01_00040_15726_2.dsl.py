from __future__ import annotations

from modu_math.dsl import (
    Canvas,
    ProblemTemplate,
    RectSlot,
    Region,
    TextSlot,
)


PROBLEM_ID = 'P3_1_01_00040_15726_2'
PROBLEM_TITLE = '수 모형으로 알아보는 262와 271의 합 (2)'


def _model_slot_ids(prefix: str, hundreds: int, tens: int, ones: int) -> tuple[str, ...]:
    return (
        *(f"slot.{prefix}.hundred.{index}" for index in range(1, hundreds + 1)),
        *(f"slot.{prefix}.ten.{index}" for index in range(1, tens + 1)),
        *(f"slot.{prefix}.one.{index}" for index in range(1, ones + 1)),
        f"slot.{prefix}.label",
    )


def _model_slots(
    prefix: str,
    *,
    x: int,
    y: int,
    number: int,
    hundreds: int,
    tens: int,
    ones: int,
) -> tuple[object, ...]:
    slots: list[object] = []

    for index in range(hundreds):
        slots.append(
            RectSlot(
                id=f"slot.{prefix}.hundred.{index + 1}",
                prompt="백 모형",
                semantic_role="hundred_block",
                x=x + index * 39,
                y=y,
                width=34,
                height=34,
                fill="#dcead5",
                stroke="#557260",
                stroke_width=1,
            )
        )

    tens_x = x + hundreds * 39 + 2
    for index in range(tens):
        slots.append(
            RectSlot(
                id=f"slot.{prefix}.ten.{index + 1}",
                prompt="십 모형",
                semantic_role="ten_rod",
                x=tens_x + index * 8,
                y=y,
                width=5,
                height=34,
                fill="#d7e8f2",
                stroke="#54758b",
                stroke_width=1,
            )
        )

    ones_x = tens_x + tens * 8 + 2
    for index in range(ones):
        slots.append(
            RectSlot(
                id=f"slot.{prefix}.one.{index + 1}",
                prompt="낱개 모형",
                semantic_role="one_block",
                x=ones_x,
                y=y + 24 + index * 7,
                width=5,
                height=5,
                fill="#f2d8d8",
                stroke="#9a5f63",
                stroke_width=1,
            )
        )

    slots.append(
        TextSlot(
            id=f"slot.{prefix}.label",
            prompt="수 모형 아래의 수",
            text=str(number),
            semantic_role="number_label",
            x=x + 64,
            y=y + 53,
            font_size=12,
            anchor="middle",
            fill="#222222",
        )
    )
    return tuple(slots)


def build_problem_template() -> ProblemTemplate:
    first_model_ids = _model_slot_ids("model262", 2, 6, 2)
    second_model_ids = _model_slot_ids("model271", 2, 7, 1)

    return ProblemTemplate(
        id=PROBLEM_ID,
        title=PROBLEM_TITLE,
        canvas=Canvas(
            width=400,
            height=145,
            coordinate_mode="logical",
        ),
        regions=(
            Region(
                id="region.stem",
                role="stem",
                flow="absolute",
                slot_ids=("slot.instruction", "slot.question"),
            ),
            Region(
                id="region.models",
                role="diagram",
                flow="absolute",
                slot_ids=(
                    "slot.model262.container",
                    *first_model_ids,
                    "slot.model271.container",
                    *second_model_ids,
                ),
            ),
            Region(
                id="region.answer",
                role="answer",
                flow="absolute",
                slot_ids=(),
            ),
        ),
        slots=(
            TextSlot(
                id="slot.instruction",
                prompt="수 모형으로 덧셈을 알아보라는 안내",
                text="262+271을 수 모형으로 알아보시오.",
                semantic_role="instruction",
                x=20,
                y=14,
                font_size=14,
                fill="#222222",
            ),
            TextSlot(
                id="slot.question",
                prompt='십 모형을 받아올림한 결과를 묻는 질문',
                text='십 모형끼리 더한 것은 백 모형 몇 개와 십 모형 몇 개가 됩니까?',
                semantic_role="question",
                x=20,
                y=124,
                font_size=14,
                fill="#222222",
            ),
            RectSlot(
                id="slot.model262.container",
                prompt="262의 수 모형을 묶는 영역",
                semantic_role="model_container",
                x=20,
                y=24,
                width=143,
                height=62,
                fill="#ffffff",
                stroke="#e36b72",
                stroke_width=1,
            ),
            *_model_slots(
                "model262",
                x=32,
                y=37,
                number=262,
                hundreds=2,
                tens=6,
                ones=2,
            ),
            RectSlot(
                id="slot.model271.container",
                prompt="271의 수 모형을 묶는 영역",
                semantic_role="model_container",
                x=188,
                y=24,
                width=141,
                height=62,
                fill="#ffffff",
                stroke="#e36b72",
                stroke_width=1,
            ),
            *_model_slots(
                "model271",
                x=190,
                y=37,
                number=271,
                hundreds=2,
                tens=7,
                ones=1,
            ),
        ),
        diagrams=(),
        groups=(),
        constraints=(),
        tags=('grade-3', 'addition', 'three-digit-addition', 'base-ten-blocks', 'regrouping', 'multi-answer'),
    )


PROBLEM_TEMPLATE = build_problem_template()


ANSWER = {'type': 'multi_numeric',
 'value': [1, 3],
 'unit': '',
 'values': [{'value': 1,
             'unit': '개',
             'target_ref': 'quantity.regrouped_hundreds'},
            {'value': 3, 'unit': '개', 'target_ref': 'quantity.remaining_tens'}],
 'answer_key': [{'id': 'answer.regrouped_hundreds',
                 'label': '백 모형',
                 'value': 1,
                 'unit': '개'},
                {'id': 'answer.remaining_tens',
                 'label': '십 모형',
                 'value': 3,
                 'unit': '개'}],
 'target_ref': 'answer.regrouped_tens',
 'derived_from': 'step.regroup_tens',
 'sentence': '백 모형 1개와 십 모형 3개가 됩니다.'}


SEMANTIC_OVERRIDE = {'problem_id': 'P3_1_01_00040_15726_2',
 'problem_type': 'base_ten_model_addition_regroup_tens',
 'metadata': {'grade': 3,
              'semester': 1,
              'subject': '수학',
              'topic': '세 자리 수의 덧셈',
              'language': 'ko-KR',
              'question': '십 모형끼리 더한 것은 백 모형 몇 개와 십 모형 몇 개가 됩니까?',
              'instruction': '262+271을 수 모형으로 알아보시오.'},
 'domain': {'objects': [{'id': 'number.first',
                         'type': 'number',
                         'label': '첫 번째 수',
                         'value': 262},
                        {'id': 'number.second',
                         'type': 'number',
                         'label': '두 번째 수',
                         'value': 271},
                        {'id': 'model.first',
                         'type': 'base_ten_model',
                         'label': '262의 수 모형',
                         'hundreds': 2,
                         'tens': 6,
                         'ones': 2},
                        {'id': 'model.second',
                         'type': 'base_ten_model',
                         'label': '271의 수 모형',
                         'hundreds': 2,
                         'tens': 7,
                         'ones': 1}],
            'relations': []},
 'answer': {'type': 'multi_numeric',
            'value': [1, 3],
            'unit': '',
            'values': [{'value': 1,
                        'unit': '개',
                        'target_ref': 'quantity.regrouped_hundreds'},
                       {'value': 3,
                        'unit': '개',
                        'target_ref': 'quantity.remaining_tens'}],
            'answer_key': [{'id': 'answer.regrouped_hundreds',
                            'label': '백 모형',
                            'value': 1,
                            'unit': '개'},
                           {'id': 'answer.remaining_tens',
                            'label': '십 모형',
                            'value': 3,
                            'unit': '개'}],
            'target_ref': 'answer.regrouped_tens',
            'derived_from': 'step.regroup_tens',
            'sentence': '백 모형 1개와 십 모형 3개가 됩니다.'}}


SOLVABLE = {'schema': 'modu.solvable.v1.2',
 'problem_id': 'P3_1_01_00040_15726_2',
 'problem_type': 'base_ten_model_addition_regroup_tens',
 'inputs': {'target_label': '십 모형끼리 더한 결과를 바꾼 백 모형과 십 모형의 개수',
            'unit': '',
            'quantities': {'first_number': 262,
                           'second_number': 271,
                           'first_model': {'hundreds': 2, 'tens': 6, 'ones': 2},
                           'second_model': {'hundreds': 2,
                                            'tens': 7,
                                            'ones': 1}}},
 'given': [{'ref': 'number.first', 'value': 262},
           {'ref': 'number.second', 'value': 271},
           {'ref': 'model.first',
            'value': {'hundreds': 2, 'tens': 6, 'ones': 2}},
           {'ref': 'model.second',
            'value': {'hundreds': 2, 'tens': 7, 'ones': 1}}],
 'target': {'ref': 'answer.regrouped_tens', 'type': 'number_list'},
 'method': '십 모형끼리 더한 뒤 십 모형 10개를 백 모형 1개로 받아올림합니다.',
 'understanding': {'summary': '262와 271의 십 모형끼리 더한 13개를 백 모형 1개와 십 모형 3개로 바꾸는 '
                              '문제입니다.',
                   'facts': [{'ref': 'model.first',
                              'label': '262의 수 모형',
                              'value': {'hundreds': 2, 'tens': 6, 'ones': 2},
                              'unit': '',
                              'source': 'explicit'},
                             {'ref': 'model.second',
                              'label': '271의 수 모형',
                              'value': {'hundreds': 2, 'tens': 7, 'ones': 1},
                              'unit': '',
                              'source': 'explicit'}],
                   'unknowns': [{'ref': 'quantity.regrouped_hundreds',
                                 'label': '십 모형을 바꾸어 얻은 백 모형의 개수',
                                 'unit': '개',
                                 'source': 'unknown'},
                                {'ref': 'quantity.remaining_tens',
                                 'label': '받아올림 뒤 남은 십 모형의 개수',
                                 'unit': '개',
                                 'source': 'unknown'}],
                   'relation': {'type': 'base_ten_regrouping',
                                'statement': '십 모형 6개와 7개를 더한 13개 중 10개를 백 모형 '
                                             '1개로 바꿉니다.',
                                'symbolic': '6+7=13=10+3',
                                'uses': ['model.first', 'model.second'],
                                'result': 'answer.regrouped_tens'}},
 'plan': ['262의 십 모형 6개와 271의 십 모형 7개를 더해 13개를 구합니다.',
          '십 모형 13개를 백 모형 1개와 십 모형 3개로 바꿉니다.'],
 'steps': [{'id': 'step.add_tens',
            'expr': '6+7',
            'value': 13,
            'explanation': '십 모형끼리 더하면 13개입니다.'},
           {'id': 'step.regroup_tens',
            'expr': '13 tens = 1 hundred + 3 tens',
            'value': [1, 3],
            'explanation': '십 모형 10개를 백 모형 1개로 바꾸면 백 모형 1개와 십 모형 3개가 됩니다.'}],
 'checks': [{'id': 'check.regroup_tens',
             'expr': '6+7',
             'expected': 13,
             'actual': 13,
             'pass': True}],
 'answer': {'type': 'multi_numeric',
            'value': [1, 3],
            'unit': '',
            'values': [{'value': 1,
                        'unit': '개',
                        'target_ref': 'quantity.regrouped_hundreds'},
                       {'value': 3,
                        'unit': '개',
                        'target_ref': 'quantity.remaining_tens'}],
            'answer_key': [{'id': 'answer.regrouped_hundreds',
                            'label': '백 모형',
                            'value': 1,
                            'unit': '개'},
                           {'id': 'answer.remaining_tens',
                            'label': '십 모형',
                            'value': 3,
                            'unit': '개'}],
            'target_ref': 'answer.regrouped_tens',
            'derived_from': 'step.regroup_tens',
            'sentence': '백 모형 1개와 십 모형 3개가 됩니다.'}}


SEMANTIC_ANSWER = SOLVABLE["answer"]
