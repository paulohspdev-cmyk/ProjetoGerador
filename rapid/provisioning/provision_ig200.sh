#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
ERRO: provision_ig200.sh foi desativado por segurança.
Este script continha identidade industrial histórica hardcoded e não pode mais alterar o Rapid SCADA.
Use exclusivamente o provisionador canônico baseado no cadastro e no Controller Pack:
  sudo /opt/rc-geradores/backend/.venv/bin/python /opt/rc-geradores/rapid/provisioning/provision_generator.py <generator_id>
Ou utilize o fluxo de provisionamento do painel/API, que exige confirmação explícita.
EOF
exit 64
