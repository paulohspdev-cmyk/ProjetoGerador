# Auditoria AZ-14 — segurança e RBAC

Data: 2026-09-30

Este relatório público foi deliberadamente sanitizado. Valores específicos de configuração de produção, quantidades de contas/sessões, caminhos sensíveis e detalhes operacionais permanecem no contexto privado de operação.

## Pontos positivos confirmados

- sessão usa token aleatório e armazenamento por hash;
- cookie de produção usa atributos seguros;
- troca de senha revoga sessões;
- senhas usam derivação com salt;
- existe proteção contra repetidas falhas de login;
- confiança em proxy é condicionada a rede explicitamente confiável;
- RBAC separa visualização, operação, cadastro e administração;
- endpoint industrial exige permissão de operação e confirmação explícita da ação;
- tokens externos usam scopes, allowlists, CIDR e rate limit;
- CORS observado não usa wildcard;
- serviços principais usam hardening systemd e menor privilégio;
- o provisionador privilegiado possui superfície de escrita restrita;
- API docs e superfícies de desenvolvimento não ficam abertas na configuração observada.

## A14-001 — segundo fator exige hardening operacional

O produto possui TOTP e enforcement para ações privilegiadas, mas a política efetiva da instalação observada ainda requer endurecimento operacional antes de ser considerada baseline final.

Detalhes específicos foram preservados fora do repositório público.

A correção futura precisa incluir rollout controlado para evitar bloquear operadores legítimos e teste fail-closed para ações privilegiadas.

## A14-002 — permissões de artefatos operacionais precisam revisão

A auditoria encontrou pelo menos um artefato de metadados industriais com permissão local mais ampla do que o princípio de menor privilégio recomenda.

Detalhes específicos foram preservados no contexto privado.

Antes de restringir, testes devem provar que API, worker e provisionador continuam com acesso necessário.

## A14-003 — confirmação textual não substitui autenticação forte

Repetir a ação em payload/header evita chamadas acidentais, mas não deve ser considerada segundo fator ou autorização independente.

## Fechamento AZ-14

A auditoria do estado atual está concluída.

Ações futuras, em PRs próprios:

1. hardening do segundo fator;
2. regressão fail-closed para operação privilegiada;
3. revisão de permissões de artefatos operacionais;
4. manter testes de cookie/CORS/proxy/RBAC;
5. revisão periódica de usuários, sessões e tokens;
6. não misturar segurança com alterações de UI ou Controller Pack.

Os detalhes privados de produção estão preservados no checkpoint operacional da Auditoria Zero.
