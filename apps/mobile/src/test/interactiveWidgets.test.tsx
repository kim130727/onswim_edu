import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  areVoxelShapesCongruent,
  computeVoxelProjections,
  RendererCanvas,
  type RendererData,
} from "@modu/student-renderer";

describe("InteractiveWidgetHost & 2D/3D Widgets", () => {
  const protractorRenderer: RendererData = {
    view_box: { width: 640, height: 360, background: "#ffffff" },
    elements: [
      {
        id: "widget_protractor_1",
        type: "interactive_widget",
        attributes: {
          x: 60,
          y: 40,
          width: 480,
          height: 280,
        },
        widget: {
          kind: "protractor_2d",
          version: 1,
          mode: "sandbox",
          props: {
            allowDrawPerpendicular: true,
          },
        },
      },
    ],
  };

  it("mounts protractor_2d widget inside RendererCanvas and supports drawing and resetting", () => {
    render(
      <RendererCanvas
        renderer={protractorRenderer}
        fieldValues={null}
        inputsEnabled={true}
      />,
    );

    expect(screen.getByTestId("protractor-2d-widget")).toBeInTheDocument();
    expect(screen.getByTestId("protractor-tool")).toBeInTheDocument();
    expect(screen.getByTestId("protractor-rotate-handle")).toBeInTheDocument();
    expect(screen.queryByTestId("protractor-drawn-line")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("protractor-draw-btn"));
    expect(screen.getByTestId("protractor-drawn-line")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("protractor-reset-btn"));
    expect(screen.queryByTestId("protractor-drawn-line")).not.toBeInTheDocument();
  });

  it("computes accurate top/front/side projections and height map for voxel stacks", () => {
    // 3-high column at (1,0..2,0), 2-high at (0,0..1,2), 1-high at (2,0,0)
    const proj = computeVoxelProjections(
      [
        [1, 0, 0],
        [1, 1, 0],
        [1, 2, 0],
        [2, 0, 0],
        [0, 0, 2],
        [0, 1, 2],
      ],
      3,
    );

    expect(proj.heights[0][1]).toBe(3);
    expect(proj.heights[0][2]).toBe(1);
    expect(proj.heights[2][0]).toBe(2);
    // Front view top row (y=2) only has col x=1 filled
    expect(proj.front[0]).toEqual([false, true, false]);
    // Front view bottom row (y=0) has all 3 cols filled
    expect(proj.front[2]).toEqual([true, true, true]);
  });

  it("detects 90-degree Y-axis rotational congruence between voxel clusters", () => {
    const base: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ];
    const rotated90: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ];
    const different: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [0, 1, 0],
    ];

    expect(areVoxelShapesCongruent(base, rotated90)).toBe(true);
    expect(areVoxelShapesCongruent(base, different)).toBe(false);
  });

  it("lazy-loads voxel_3d widget with view presets and live projection grids", async () => {
    const voxelRenderer: RendererData = {
      view_box: { width: 640, height: 360 },
      elements: [
        {
          id: "widget_voxel_1",
          type: "interactive_widget",
          attributes: { x: 40, y: 40, width: 420, height: 260 },
          widget: {
            kind: "voxel_3d",
            mode: "sandbox",
            props: {
              baseBlocks: [
                [0, 0, 0],
                [0, 1, 0],
                [1, 0, 0],
              ],
              extraBlocksLimit: 1,
              showViewButtons: true,
              showProjectionGrid: true,
            },
          },
        },
      ],
    };

    render(
      <RendererCanvas
        renderer={voxelRenderer}
        fieldValues={null}
        inputsEnabled={true}
      />,
    );

    expect(await screen.findByTestId("voxel-3d-widget")).toBeInTheDocument();
    expect(screen.getByTestId("voxel-view-top")).toBeInTheDocument();
    expect(screen.getByTestId("voxel-projections-panel")).toBeInTheDocument();
    expect(screen.getByTestId("voxel-projection-위")).toBeInTheDocument();
    expect(screen.getByTestId("voxel-projection-앞")).toBeInTheDocument();
    expect(screen.getByTestId("voxel-projection-옆")).toBeInTheDocument();
  });

  it("lazy-loads solid_3d widget with overlay compare and 1cm^3 unit cube controls", async () => {
    const solidRenderer: RendererData = {
      view_box: { width: 640, height: 360 },
      elements: [
        {
          id: "widget_solid_1",
          type: "interactive_widget",
          attributes: { x: 40, y: 40, width: 460, height: 260 },
          widget: {
            kind: "solid_3d",
            mode: "sandbox",
            props: {
              allowOverlayCompare: true,
              allowUnitCubeFill: true,
            },
          },
        },
      ],
    };

    render(
      <RendererCanvas
        renderer={solidRenderer}
        fieldValues={null}
        inputsEnabled={true}
      />,
    );

    expect(await screen.findByTestId("solid-3d-widget")).toBeInTheDocument();
    const overlayBtn = screen.getByTestId("solid-overlay-btn");
    expect(overlayBtn).toHaveTextContent("겹쳐 비교하기");
    fireEvent.click(overlayBtn);
    expect(overlayBtn).toHaveTextContent("나란히 보기");

    expect(screen.getByTestId("solid-unit-cube-btn")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("solid-reset-btn"));
    expect(overlayBtn).toHaveTextContent("겹쳐 비교하기");
  });

  it("mounts graph_2d widget with wave-break and bar-line overlay toggle", () => {
    const graphRenderer: RendererData = {
      view_box: { width: 640, height: 360 },
      elements: [
        {
          id: "widget_graph_1",
          type: "interactive_widget",
          attributes: { x: 40, y: 30, width: 460, height: 280 },
          widget: {
            kind: "graph_2d",
            mode: "sandbox",
            props: {
              chartType: "line",
              title: "승재의 100m 달리기 기록",
              xAxis: { label: "대회", categories: ["1차", "2차", "3차", "4차"] },
              yAxis: {
                label: "기록",
                unit: "초",
                min: 17,
                max: 20,
                majorStep: 1,
                minorStep: 0.2,
                waveBreak: { from: 0, to: 16.6 },
              },
              series: [
                {
                  id: "run",
                  type: "line",
                  color: "#db2777",
                  values: [19.2, 18.4, 17.8, 17.4],
                  editable: true,
                },
              ],
            },
          },
        },
      ],
    };

    render(
      <RendererCanvas
        renderer={graphRenderer}
        fieldValues={null}
        inputsEnabled={true}
      />,
    );

    expect(screen.getByTestId("graph-2d-widget")).toBeInTheDocument();
    expect(screen.getByTestId("graph-wave-break")).toBeInTheDocument();
    expect(screen.getByTestId("graph-line-0")).toBeInTheDocument();

    const toggleBtn = screen.getByTestId("graph-overlay-toggle");
    expect(screen.queryByTestId("graph-bar-0-0")).not.toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("graph-bar-0-0")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("graph-reset-btn"));
    expect(screen.queryByTestId("graph-bar-0-0")).not.toBeInTheDocument();
  });
});
