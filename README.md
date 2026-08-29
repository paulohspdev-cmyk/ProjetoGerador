# RC Geradores — ProjetoGerador

Plataforma SCADA/gestão para grupos geradores e ativos elétricos, com **Rapid SCADA como motor industrial** e o painel RC Geradores como camada de produto.

## Arquitetura

```text
Controladora / ativo
        │
        ├─ Modbus TCP direto ───────────────┐
        ├─ Modbus RTU serial ───────────────┤
        ├─ RTU over TCP / gateway ──────────┤
        │                                    ▼
        └─ modem/DTU TCP Client ─► RC Reverse TCP Bridge
                                             │
                                             ▼
                                      Rapid SCADA
                                   Server + Communicator
                                             │
                              canais / histórico / estado
                                             │
                                             ▼
                                      Backend FastAPI
                                             │
                                             ▼
                                      Frontend TanStack
```

O domínio v3 separa as entidades industriais:

```text
Cliente / Site
      │
      ▼
    Asset ───────────────┐
      │                  │ relações de topologia
      ▼                  ▼
Controller Instance ── Asset (rede / ATS / bus / BESS / gerador ...)
      │
      ▼
 Connection
      │
      ▼
Controller Pack
      │
      ▼
Rapid Device / Channels
```

Isso permite representar geradores, rede, ATS, barramento, BESS, motores, switchgear, torres, gateways e instalações com várias controladoras no mesmo site.

Regras de arquitetura:

- **Rapid SCADA é o mestre industrial e a fonte de telemetria/histórico.**
- A **RC Reverse TCP Bridge existe somente para `reverse_tcp`**, quando o modem/DTU inicia a conexão.
- Modbus TCP direto, RTU-over-TCP e serial são provisionados no Communicator e não abrem listener reverso na bridge.
- O caminho normal Rapid → controladora aceita somente leitura Modbus FC03/FC04 pela bridge.
- O frontend não inventa telemetria. Canal não homologado aparece como **N/D**.
- Comandos genéricos são proibidos. O Controller Pack determina capacidades liberadas.
- Estar presente no catálogo não significa estar homologado: somente Controller Packs `production` podem provisionar operação industrial.

## Controller Pack homologado

O primeiro pack de produção é:

```text
ComAp InteliGen 200
status: field_validated
telemetria atual homologada: RPM, frequência e tensões do gerador
comandos homologados: START e STOP
```

AUTO, MANUAL, TEST, MCB, GCB e paralelismo permanecem bloqueados até homologação específica.

A configuração de campo original utilizou:

```text
Reverse TCP externo: 15001
Bridge local Rapid:   127.0.0.1:25001
Modbus Unit ID:       2
Rapid Device:         200
Rapid Channels:       2001..2008
```

O runtime multi-device resolve a identidade pelo binding real do equipamento. Rapid Device não é usado como autorização de segurança. START/STOP exige simultaneamente Controller Pack de produção, modelo homologado, binding coerente com cadastro/porta/Unit/Device, controle explicitamente habilitado e retorno válido do controlador. AUTO, TEST, MCB, GCB e paralelismo continuam bloqueados.

## Catálogo de controladoras

`controllers/catalog/catalog-v1.json` mantém o catálogo de modelos alvo ComAp e DSE. O catálogo é separado dos Controller Packs:

```text
CATÁLOGO  → modelo conhecido pelo produto; sem polling/comando automático
LAB       → pack em investigação; não provisionável em produção
PRODUCTION→ pack homologado e autorizado pelo provisionador
```

Essa separação evita transformar uma lista de compatibilidade desejada em suporte industrial não testado.

## Operação industrial v3

A plataforma possui módulos persistentes para:

- alarmes industriais ativos e reconhecimento;
- histórico de processo separado da auditoria administrativa;
- tendências analógicas pelo archive do Rapid SCADA;
- planos preventivos por horímetro e/ou calendário;
- histórico de manutenção;
- escalonamento de alarmes somente para notificações;
- topologia entre assets;
- relatórios CSV/XLSX/PDF;
- scheduler de backup, relatório e notificação;
- tokens de API e integrações.

Alarmes nativos individuais da controladora só são exibidos quando seus códigos/bitfields forem homologados no Controller Pack. Enquanto isso, a plataforma registra apenas condições que consegue provar (por exemplo, perda de comunicação, estado de alerta ou `alarm_count` quando o canal existe).

## Estrutura

```text
src/                         frontend React/TanStack
public/                      ativos visuais
backend/                     API FastAPI, auth, RBAC, worker e integrações
controllers/catalog/         catálogo alvo, sem poder industrial
controllers/production/      Controller Packs homologados
controllers/lab/             controladoras em investigação
rapid/reader/                leitor oficial do Rapid SCADA Server
rapid/templates/             templates do Communicator
rapid/provisioning/          provisionamento/reconcile/deprovision seguro
ops/systemd/                 serviços Linux
ops/nginx/                   proxy da aplicação
ops/install.sh               instalação/reaplicação da VM
ops/deploy_release.sh         deploy controlado por commit
ops/status.sh                diagnóstico detalhado
ops/vm-smoke.sh              teste de aceitação pós-instalação
docs/                        arquitetura e auditorias
.github/workflows/ci.yml     validação de build e política industrial
```

## Serviços da VM

Após a instalação:

```text
rc-geradores-bridge       reverse TCP + socket de controle homologado
rc-geradores-provision    helper root para provisionar/reconciliar/deprovisionar Rapid
rc-geradores-api          FastAPI em 127.0.0.1:8090
rc-geradores-worker       alarmes, notificações, scheduler e automação não industrial
rc-geradores-frontend     TanStack/Node em 127.0.0.1:3000
nginx                     entrada HTTP na porta 80
scadaserver6              Rapid SCADA Server
scadacomm6                Rapid SCADA Communicator
```

## Instalação em VM Ubuntu limpa

Clone o repositório em uma área temporária e execute o instalador:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/paulohspdev-cmyk/ProjetoGerador.git /tmp/ProjetoGerador
cd /tmp/ProjetoGerador
sudo bash ops/install.sh
```

O instalador:

1. instala dependências e garante **Node 22**, **.NET SDK 8** e **.NET Runtime 8**;
2. instala/valida Rapid SCADA 6.4.7;
3. instala o projeto em `/opt/rc-geradores`;
4. solicita a senha do primeiro administrador sem gravá-la em texto claro;
5. por padrão cria o primeiro IG200 e provisiona o Rapid usando o **cadastro real do banco**, não valores paralelos hardcoded;
6. compila o leitor oficial do Rapid SCADA;
7. compila o frontend para Linux/Node;
8. instala e inicia bridge, provisionador, API, worker, frontend, Rapid e Nginx;
9. valida API, proxy, serviços, sockets, BaseDAT, bindings e executa o smoke test da VM.

### Instalar sem gerador inicial

```bash
sudo bash ops/install.sh --skip-initial-generator
```

### Configurar o primeiro IG200

```bash
sudo bash ops/install.sh \
  --ig200-tag GEN001 \
  --ig200-name "Gerador 01" \
  --ig200-site "Principal" \
  --ig200-port 16001 \
  --ig200-unit 3 \
  --ig200-device 210
```

Porta, Unit ID e Rapid Device são identidades de comunicação/provisionamento. O provisionador impede identidade Modbus duplicada na mesma sessão reverse TCP e o controle usa o binding real, não um número de Device hardcoded.

Se a tag já existir, o instalador **preserva a identidade industrial existente** em vez de sobrescrever silenciosamente porta, Unit ID ou Rapid Device. O provisionador também recusa reutilizar um runtime binding que tenha divergido do cadastro.

### Bootstrap automatizado de administrador

```bash
sudo install -m 600 /dev/null /root/rc-admin-password
sudo sh -c 'printf "%s\n" "SENHA_FORTE_AQUI" > /root/rc-admin-password'
sudo bash ops/install.sh --admin-password-file /root/rc-admin-password
sudo rm -f /root/rc-admin-password
```

O arquivo deve ser regular, pertencente ao root e `chmod 600` quando o bootstrap é executado como root.

## Controle remoto

Por segurança, START/STOP ficam desabilitados na primeira instalação. Depois de confirmar telemetria, identidade e comunicação do equipamento de campo, a configuração pode ser reaplicada explicitamente com:

```bash
cd /opt/rc-geradores
sudo bash ops/install.sh --enable-control
```

Isso habilita somente o caminho START/STOP do **InteliGen 200 homologado**. O backend/bridge valida o modelo, o Controller Pack, o binding do Rapid Device, a porta, o Modbus Unit e o cadastro antes de aceitar o comando. AUTO, TEST, MCB, GCB e paralelismo continuam bloqueados.

## Provisionamento e ciclo de vida

O provisionador é idempotente e possui reconcile:

- preserva números de canais existentes;
- adiciona canais novos do pack sem renumerar históricos;
- reconcilia Device/Unit/XML/template quando a identidade cadastrada é comprovada;
- faz backup e rollback antes de alterar Rapid SCADA;
- mantém `CmdEnabled=false` no Communicator.

A retirada de um gerador provisionado deve usar o fluxo de **retirada segura** do painel. Esse fluxo:

1. exige confirmação explícita;
2. faz backup;
3. desativa os canais sem apagar/renumerar o histórico;
4. remove Device e Line quando ela fica vazia;
5. arquiva o binding retirado;
6. só depois remove o cadastro do produto.

## Validação da VM

```bash
sudo /opt/rc-geradores/ops/vm-smoke.sh
```

Quando a VM deve obrigatoriamente ter pelo menos um gerador provisionado:

```bash
sudo /opt/rc-geradores/ops/vm-smoke.sh --require-generator
```

O smoke verifica, entre outros pontos:

- Node 22+;
- .NET SDK 8 e Runtime 8;
- serviços RC, Rapid SCADA e Nginx;
- API, frontend e proxy HTTP;
- sockets privilegiados;
- integridade BaseDAT;
- leitor oficial do Rapid;
- correspondência entre runtime bindings e cadastro do banco;
- listeners reverse TCP e porta local usada pelo Rapid quando aplicável.

Diagnóstico detalhado:

```bash
sudo /opt/rc-geradores/ops/status.sh
```

## Runtime e dados persistentes

```text
/etc/rc-geradores.env                              configuração da VM
/var/lib/rc-geradores/rc-geradores.db             banco do produto
/var/lib/rc-geradores/rapid-bindings.json         bindings Rapid ativos
/var/lib/rc-geradores/rapid-retired-bindings.json bindings retirados
/var/lib/rc-geradores/backups/                    backups
/var/lib/rc-geradores/reports/                    relatórios
/var/lib/rc-geradores/rapid-provision/            checkpoints do provisionador
/run/rc-geradores/control.sock                    controle IG200 local
/run/rc-geradores/provision.sock                  ciclo de vida Rapid local
/opt/scada                                         Rapid SCADA
```

`rapid/bindings.json` no repositório é apenas referência canônica. Uma VM limpa não é considerada provisionada por causa desse arquivo; o runtime só é adotado quando a configuração correspondente existe de fato no Rapid SCADA.

O banco SQLite guarda cadastro, alarmes/estado e dados do produto; **não substitui o historiador Rapid SCADA para séries analógicas**.

## Segurança

- login por sessão HTTP-only, RBAC e auditoria;
- rate limiting de login e suporte a TOTP/2FA no backend;
- API externa por token e escopos;
- provisionador Rapid isolado em socket Unix local;
- bridge industrial de leitura bloqueia funções Modbus de escrita no caminho normal;
- automação aceita somente ações não industriais (`notify` e `work_order`);
- escalonamento de alarmes somente enfileira notificações;
- START/STOP passam por confirmação explícita, Controller Pack homologado, binding real, socket local e retorno do controlador;
- AUTO, TEST, MCB, GCB e paralelismo permanecem bloqueados no IG200 atual;
- bindings divergentes não são reutilizados silenciosamente;
- retirada de equipamento preserva canais/histórico antes de excluir cadastro;
- SMTP, WhatsApp e acesso público devem receber credenciais/configuração reais antes do uso;
- para exposição fora da rede confiável, configure HTTPS e `RC_AUTH_COOKIE_SECURE=1`.

## Desenvolvimento

Frontend:

```bash
npm ci
npx tsc --noEmit
npm run build
```

Backend:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export RC_DATA_DIR="$PWD/.data"
uvicorn app.main:app --host 127.0.0.1 --port 8090 --reload
```

A documentação OpenAPI é desabilitada por padrão em produção. Para desenvolvimento, configure `RC_API_DOCS=1` e acesse `/api/docs`.

## CI

O workflow valida, entre outros pontos:

- TypeScript;
- build cliente + SSR/Node;
- smoke test do servidor frontend;
- backend, autenticação e RBAC;
- domínio v3, catálogo e operações industriais;
- alarmes, manutenção e escalonamento;
- ciclo de vida/reconcile/deprovision;
- sintaxe e contrato dos instaladores;
- ausência de `node_modules`, bytecode Python e artefatos de runtime no Git;
- ausência de séries/dados industriais demonstrativos conhecidos;
- política de Controller Packs e comandos bloqueados;
- bridge apenas para reverse TCP;
- compartilhamento reverse TCP com Unit IDs distintos;
- binding runtime materializado antes de ser reutilizado;
- `CmdEnabled=false` no provisionamento Rapid.

O CI não substitui o teste em uma VM Linux real com Rapid SCADA e equipamento de campo. Antes de considerar uma implantação homologada, a `main` deve estar verde e a VM deve passar `ops/vm-smoke.sh`.
