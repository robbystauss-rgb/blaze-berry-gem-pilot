import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/112pm")({
  beforeLoad: () => {
    throw redirect({ to: "/hats", statusCode: 301 });
  },
});
