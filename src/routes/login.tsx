import { createFileRoute } from "@tanstack/react-router";

import { LoginScreen } from "@/components/auth/LoginScreen";

export const Route = createFileRoute("/login")({
  component: LoginScreen,
  head: () => ({
    meta: [
      { title: "Login | RC Geradores SCADA" },
      { name: "description", content: "Acesso ao sistema SCADA RC Geradores." },
    ],
  }),
});
