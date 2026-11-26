import React, { Suspense, lazy } from "react";
import { asRecord, readNumber } from "../presentation";
import type { RendererElement } from "../types";
import { Protractor2DWidget } from "./protractor/Protractor2DWidget";
import { Graph2DWidget } from "./graph/Graph2DWidget";
import type { InteractiveWidgetSpec } from "./types";

const LazyVoxel3DWidget = lazy(() =>
  import("./three/Voxel3DWidget").then((m) => ({ default: m.Voxel3DWidget })),
);
const LazySolid3DWidget = lazy(() =>
  import("./three/Solid3DWidget").then((m) => ({ default: m.Solid3DWidget })),
);

export interface InteractiveWidgetHostProps {
  element: RendererElement;
  scale: number;
  interactive?: boolean;
}

function widgetSpecFromElement(element: RendererElement): InteractiveWidgetSpec | null {
  const raw = element.widget ?? asRecord(element.attributes).widget;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const spec = raw as InteractiveWidgetSpec;
  if (typeof spec.kind !== "string" || !spec.kind) return null;
  return spec;
}

export const InteractiveWidgetHost: React.FC<InteractiveWidgetHostProps> = ({
  element,
  scale,
  interactive = true,
}) => {
  const spec = widgetSpecFromElement(element);
  if (!spec) return null;

  const attributes = asRecord(element.attributes);
  const x = readNumber(attributes.x) ?? 0;
  const y = readNumber(attributes.y) ?? 0;
  const width = Math.max(40, readNumber(attributes.width) ?? 320);
  const height = Math.max(40, readNumber(attributes.height) ?? 240);

  const renderWidget = () => {
    switch (spec.kind) {
      case "protractor_2d":
        return (
          <Protractor2DWidget
            width={width}
            height={height}
            rawProps={spec.props}
            interactive={interactive}
          />
        );
      case "voxel_3d":
        return (
          <LazyVoxel3DWidget
            width={width}
            height={height}
            rawProps={spec.props}
            interactive={interactive}
          />
        );
      case "solid_3d":
        return (
          <LazySolid3DWidget
            width={width}
            height={height}
            rawProps={spec.props}
            interactive={interactive}
          />
        );
      case "graph_2d":
        return (
          <Graph2DWidget
            width={width}
            height={height}
            rawProps={spec.props}
            interactive={interactive}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-interactive-widget={element.id ?? spec.kind}
      data-widget-kind={spec.kind}
      style={{
        position: "absolute",
        left: x * scale,
        top: y * scale,
        width: width * scale,
        height: height * scale,
        touchAction: "none",
      }}
    >
      <Suspense fallback={null}>{renderWidget()}</Suspense>
    </div>
  );
};
