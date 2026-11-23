import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_LIMIT,
  DASHBOARD_WIDGET_TYPES,
  createDashboardWidget,
  dashboardWidgetDefinition,
  defaultDashboardWidgets,
  normalizeDashboardColor,
  normalizeDashboardName,
  parseDashboardWidgets,
} from "../src/lib/dashboards.ts";

test("the catalogue defines every widget type exactly once", () => {
  assert.equal(DASHBOARD_WIDGETS.length, DASHBOARD_WIDGET_TYPES.length);
  assert.deepEqual(
    DASHBOARD_WIDGETS.map((definition) => definition.type).sort(),
    [...DASHBOARD_WIDGET_TYPES].sort(),
  );
  for (const definition of DASHBOARD_WIDGETS) {
    assert.ok(definition.label.length > 0);
    assert.ok(definition.description.length > 0);
    assert.ok(["half", "full"].includes(definition.defaultSize));
    assert.equal(dashboardWidgetDefinition(definition.type), definition);
  }
});

test("a new widget starts at the catalogue size unless told otherwise", () => {
  assert.equal(createDashboardWidget("chart").size, dashboardWidgetDefinition("chart").defaultSize);
  assert.equal(createDashboardWidget("chart", "half").size, "half");
  assert.notEqual(createDashboardWidget("chart").id, createDashboardWidget("chart").id);
});

test("the starting layout is non-empty and uses distinct types", () => {
  const widgets = defaultDashboardWidgets();
  assert.ok(widgets.length > 0);
  assert.equal(new Set(widgets.map((widget) => widget.type)).size, widgets.length);
});

test("names are trimmed and collapsed, and length is enforced", () => {
  assert.equal(normalizeDashboardName("  Monthly   review  "), "Monthly review");
  assert.equal(normalizeDashboardName("A"), null);
  assert.equal(normalizeDashboardName("A".repeat(41)), null);
  assert.equal(normalizeDashboardName(42), null);
  assert.equal(normalizeDashboardName(undefined), null);
});

test("colors accept only a plain hex tint", () => {
  assert.equal(normalizeDashboardColor("#60A5FA"), "#60a5fa");
  assert.equal(normalizeDashboardColor("red"), null);
  assert.equal(normalizeDashboardColor("url(javascript:alert(1))"), null);
  assert.equal(normalizeDashboardColor(null), null);
});

test("a saved layout keeps its ids, types and sizes", () => {
  const layout = [
    { id: "widget-a", type: "overview", size: "full" },
    { id: "widget-b", type: "chart", size: "half" },
  ];
  assert.deepEqual(parseDashboardWidgets(layout), layout);
});

test("a missing size falls back to the catalogue default", () => {
  const parsed = parseDashboardWidgets([{ type: "allocation" }]);
  assert.ok(parsed);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.size, dashboardWidgetDefinition("allocation").defaultSize);
  assert.ok(parsed[0]?.id);
});

test("a layout with no ids still yields unique keys", () => {
  const parsed = parseDashboardWidgets([{ type: "chart" }, { type: "holdings" }, { type: "chart", size: "half" }]);
  assert.equal(parsed, null, "duplicate types are rejected rather than silently deduplicated");

  const valid = parseDashboardWidgets([{ type: "chart" }, { type: "holdings" }]);
  assert.ok(valid);
  assert.equal(new Set(valid.map((widget) => widget.id)).size, valid.length);
});

test("widgets are bounded and must be a non-empty array", () => {
  assert.equal(parseDashboardWidgets([]), null);
  assert.equal(parseDashboardWidgets("overview"), null);
  assert.equal(parseDashboardWidgets([{ type: "not-a-widget" }]), null);
  assert.equal(parseDashboardWidgets([{ type: "chart", size: "huge" }]), null);
  assert.equal(parseDashboardWidgets([null]), null);

  const tooMany = Array.from({ length: DASHBOARD_WIDGET_LIMIT + 1 }, (_, index) => ({
    type: DASHBOARD_WIDGET_TYPES[index % DASHBOARD_WIDGET_TYPES.length],
  }));
  assert.equal(parseDashboardWidgets(tooMany), null);
});
