import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/flows")({
  component: FlowsLayout,
});

function FlowsLayout() {
  return <Outlet />;
}