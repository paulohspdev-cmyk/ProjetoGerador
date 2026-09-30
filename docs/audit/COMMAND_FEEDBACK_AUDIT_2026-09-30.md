# Auditoria AZ-07/AZ-08 — mensagens, eventos e confirmação de comandos

Data: 2026-09-30  
Release observada: `20a68c2d0e146addcca708290a1564c63ffa305e`

## Objetivo

Garantir que:

- mensagem temporária de interface não seja confundida com histórico;
- protocolo aceito não seja confundido com ação física confirmada;
- cada Controller Pack tenha seu contrato de feedback realmente executado pelo código;
- evidência durável preserve informação suficiente para diagnóstico.

## Camadas atuais

### 1. Mensagem temporária do card

`PowerFlowCard.tsx` mantém `commandMessage` em estado local.

Hoje:

- é limpa ao iniciar um novo comando;
- recebe `result.reason` em sucesso;
- recebe erro em falha;
- **não possui TTL**.

Resultado: uma mensagem de falha ou sucesso pode permanecer indefinidamente na superfície do card.

Contrato desejado:

- feedback informativo do card: aproximadamente 2 s;
- falha/alarmes/evidência: persistem fora do card, em histórico/auditoria.

### 2. Events

Executores industriais gravam eventos no banco.

DSE atualmente preserva bastante contexto:

- action;
- key;
- accepted;
- modo antes/depois;
- RPM antes/depois;
- status flags.

IG200 preserva menos:

- action;
- reason;
- retorno reservado;
- **RPM antes**.

Apesar de o executor ler `rpm_after`, esse valor não é gravado no evento atual.

### 3. Audit log

O endpoint grava:

`accepted=<bool>; <reason>`

No IG200, isso significa que a auditoria persistente também não preserva o feedback `rpm_after`.

## A08-001 — o wrapper colapsa estados diferentes

`send_homologated_command()` termina com:

`state = "controller_accepted" if result.accepted else "rejected"`

Isso perde a distinção entre:

- controlador aceitou;
- ação está pendente;
- feedback físico confirmou;
- ação falhou após aceite.

Contrato novo obrigatório:

- `submitted`;
- `accepted`;
- `pending`;
- `confirmed`;
- `failed`.

## A08-002 — IG200 não executa o contrato de feedback declarado no pack

O Controller Pack `comap/inteligen-200` declara:

### START

- feedback: RPM > 100;
- timeout de feedback: 15 s;
- timeout total: 20 s.

### STOP

- feedback: RPM <= 100;
- timeout de feedback: 30 s;
- timeout total: 35 s.

Porém `bridge.py::ig200_command()` faz:

1. envia comando;
2. lê retorno reservado;
3. se retorno é esperado, define `accepted=true`;
4. espera apenas 2 s;
5. tenta ler `rpm_after`;
6. **não usa `rpm_after` para alterar `accepted` ou `ok`**.

Consequência:

um START pode retornar sucesso para a API mesmo que a partida física ainda não tenha sido confirmada.

O mesmo vale para STOP.

### Evidência real

Há diversos eventos de START IG200 registrados como:

`comando aceito pelo controlador; retorno=0x000001FF; rpm=0`

O evento grava apenas o RPM anterior, portanto não permite provar pelo histórico se a máquina atingiu Running depois.

## A08-003 — IG4 é mais rigoroso, mas timeout não coincide com o pack

No IG4:

- retorno reservado aceito não basta;
- o executor observa estado/RPM;
- o handler de produção converte `accepted=true` em falha quando `running_confirmed=false`.

Isso está alinhado com o princípio correto.

Porém:

- pack declara feedback timeout de 8 s;
- implementação observa por aproximadamente 6 s.

Portanto há divergência entre contrato e executor.

Correção futura deve fazer o executor consumir o timeout do contrato, não duplicar número mágico.

## A08-004 — DSE START/STOP usam feedback, mas modo usa timeout menor que o contrato

DSE atual:

- START: espera até 15 s;
- STOP: espera até 30 s;
- OFF/AUTO/MANUAL/TEST: espera apenas 3 s.

O pack declara para os modos:

- feedback timeout: 5 s;
- timeout total: 10 s.

Portanto OFF/AUTO/MANUAL/TEST podem ser declarados não confirmados **2 s antes do limite definido no próprio contrato**.

Isso não prova que as tentativas MANUAL/TEST do GEN163 teriam funcionado com 5 s — nas tentativas observadas o modo permaneceu `1 -> 1` — mas é uma inconsistência real que precisa ser removida.

## A08-005 — DSE START possui estado pendente real, mas o contrato genérico não o representa

Para START DSE, o executor pode detectar timer interno ativado antes do RPM subir:

- `accepted=true`;
- `start_pending=true`;
- `running_confirmed=false`;
- reason informa temporização interna ativa.

Isso é um caso legítimo de **pending**.

Hoje o wrapper devolve `state=controller_accepted`, não `pending`.

A UI também não possui modelo próprio para pending.

## A08-006 — evidência durável IG200 é insuficiente para provar feedback

O executor já obtém `rpm_after`, mas:

- evento grava apenas `rpm_before`;
- audit log grava accepted/reason;
- reason é apenas "comando aceito pelo controlador".

Portanto o dado que poderia ajudar a confirmar/diagnosticar desaparece da evidência persistida.

Futuro evento estruturado deve preservar, no mínimo:

- action;
- request id/correlation id;
- controller return;
- state before;
- feedback samples;
- final state;
- accepted;
- confirmed;
- elapsed time;
- failure reason.

## A07-001 — mensagem de 2 s não pode apagar evidência

A correção de BUG-001 deverá apenas controlar a superfície temporária.

Exemplo:

- card mostra "START não confirmado" por ~2 s;
- histórico continua contendo a falha;
- audit log continua contendo o comando;
- alarme real continua ativo enquanto a condição existir.

Nunca implementar TTL apagando evento/auditoria.

## Modelo de resultado proposto

Exemplo conceitual:

```json
{
  "requestState": "completed",
  "controllerState": "accepted",
  "physicalState": "confirmed",
  "action": "start",
  "feedback": {
    "metric": "rpm",
    "before": 0,
    "after": 1799,
    "threshold": 100,
    "elapsedMs": 6400
  }
}
```

Para temporização DSE:

```json
{
  "requestState": "pending",
  "controllerState": "accepted",
  "physicalState": "pending",
  "action": "start"
}
```

## Regra de implementação futura

O executor não deve possuir timeout/threshold duplicado em código quando eles já existem no Controller Pack.

O fluxo deve receber o contrato efetivo e aplicar:

- preconditions;
- timeout;
- feedback metric;
- operator;
- expected value.

Se código e pack divergirem, teste deve falhar.

## Critério de fechamento AZ-07/AZ-08

- TTL visual de ~2 s testado;
- histórico preservado;
- IG200 cumpre feedback START/STOP;
- IG4 usa timeout do contrato;
- DSE usa timeout do contrato;
- pending DSE representado explicitamente;
- audit/event preservam feedback final;
- API não retorna sucesso físico para simples aceite protocolar;
- E2E diferencia accepted, pending, confirmed e failed.
