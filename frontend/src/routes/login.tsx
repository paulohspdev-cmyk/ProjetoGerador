import { createFileRoute } from "@tanstack/react-router";

import { LoginScreen } from "@/features/auth/LoginScreen";

export const Route = createFileRoute("/login")({
  component: LoginScreen,
  head: () => ({
    meta: [
      { title: "Acesso | RC Geradores" },
      { name: "description", content: "Acesso ao sistema RC Geradores." },
    ],
  }),
});
