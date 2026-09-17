import { createFileRoute } from "@tanstack/react-router";

import { ResetPasswordScreen } from "@/components/auth/ResetPasswordScreen";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"].trim() : "",
  }),
  component: ResetPasswordRoute,
  head: () => ({ meta: [{ title: "Redefinir senha | RC Geradores" }] }),
});

function ResetPasswordRoute() {
  const { token } = Route.useSearch();
  return <ResetPasswordScreen token={token} />;
}
