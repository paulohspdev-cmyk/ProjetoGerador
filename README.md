# RC Geradores — ProjetoGerador

Plataforma de supervisão e operação de grupos geradores com **Rapid SCADA como motor industrial** e o painel RC Geradores como camada de produto.

## Arquitetura

```text
Controladora / gerador
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

Regras de arquitetura:

- **Rapid SCADA é o mestre industrial e a fonte de telemetria/histórico.**
- A **RC Reverse TCP Bridge existe somente para `reverse_tcp`**, quando o modem/DTU inicia a conexão.
- Modbus TCP direto, RTU-over-TCP e serial são provisionados no Communicator e não abrem listener reverso na bridge.
- O caminho normal Rapid → controladora aceita somente leitura Modbus FC03/FC04 pela bridge.
- O frontend não inventa telemetria. Canal não homologado aparece como **N/D**.
- Comandos genéricos são proibidos. O Controller Pack determina capacidades liberadas.

## Controller Pack homologado

O primeiro pack de produção é:

```text
ComAp InteliGen 200
status: field_validated
telemetria: RPM, frequência e tensões do gerador
comandos: START e STOP
```

AUTO, MANUAL, TEST, MCB, GCB e paralelismo permanecem bloqueados até homologação específica.

O IG200 inicial validado utiliza:

```text
Reverse TCP externo: 15001
Bridge local Rapid:   127.0.0.1:25001
Modbus Unit ID:       2
Rapid Device:         200
Rapid Channels:       2001..2008
```

Mais de um Unit ID pode compartilhar a mesma sessão física reverse TCP. O provisionador impede Unit ID duplicado na mesma porta.

## Estrutura

```text
src/                         frontend React/TanStack
public/                      ativos visuais
backend/                     API FastAPI, auth, RBAC, worker e integrações
controllers/production/      Controller Packs homologados
controllers/lab/             controladoras em investigação
rapid/reader/                leitor oficial do Rapid SCADA Server
rapid/templates/             templates do Communicator
rapid/provisioning/          provisionamento seguro de linhas/devices/canais
ops/systemd/                 serviços Linux
ops/nginx/                   proxy da aplicação
ops/install.sh               instalação da VM
ops/status.sh                diagnóstico local
docs/                        arquitetura e auditorias
.github/workflows/ci.yml     validação de build e política industrial
```

## Serviços da VM

Após a instalação:

```text
rc-geradores-bridge       reverse TCP + socket de controle homologado
rc-geradores-provision    helper root local para provisionar Rapid SCADA
rc-geradores-api          FastAPI em 127.0.0.1:8090
rc-geradores-worker       notificações, scheduler e automação não industrial
rc-geradores-frontend     TanStack/Node em 127.0.0.1:3000
nginx                     entrada HTTP na porta 80
scadaserver6              Rapid SCADA Server
scadacomm6                Rapid SCADA Communicator
```

## Instalação em VM Ubuntu limpa

Primeiro clone o repositório em uma área temporária e execute o instalador interativamente:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/paulohspdev-cmyk/ProjetoGerador.git /tmp/ProjetoGerador
cd /tmp/ProjetoGerador
sudo bash ops/install.sh
```

O instalador:

1. instala dependências, Node 22 e .NET 8;
2. instala/valida Rapid SCADA 6.4.7;
3. instala o projeto em `/opt/rc-geradores`;
4. solicita a senha do primeiro administrador sem gravá-la em texto claro;
5. cria o IG200 inicial e provisiona Line 100 / Device 200 / canais 2001..2008;
6. compila o leitor oficial do Rapid SCADA;
7. compila o frontend para Linux/Node;
8. instala e inicia bridge, provisionador, API, worker, frontend, Rapid e Nginx;
9. valida API, proxy, serviços, sockets, BaseDAT e runtime bindings.

Por segurança, START/STOP ficam desabilitados na primeira instalação. Depois de confirmar telemetria e comunicação do equipamento de campo, a instalação pode ser reaplicada explicitamente com:

```bash
cd /opt/rc-geradores
sudo bash ops/install.sh --enable-control
```

Isso habilita somente o caminho START/STOP do **InteliGen 200 homologado**. Não libera outros comandos.

## Diagnóstico

```bash
sudo /opt/rc-geradores/ops/status.sh
```

O diagnóstico verifica serviços RC, Rapid SCADA, portas, API, cadastro, runtime bindings, sockets privilegiados e logs recentes.

## Runtime e dados persistentes

```text
/etc/rc-geradores.env                         configuração da VM
/var/lib/rc-geradores/rc-geradores.db        banco do produto
/var/lib/rc-geradores/rapid-bindings.json    bindings Rapid em runtime
/var/lib/rc-geradores/backups/               backups
/var/lib/rc-geradores/reports/               relatórios
/var/lib/rc-geradores/rapid-provision/       checkpoints do provisionador
/run/rc-geradores/control.sock               controle IG200 local
/run/rc-geradores/provision.sock             provisionamento Rapid local
/opt/scada                                    Rapid SCADA
```

O banco SQLite guarda cadastro e dados do produto; **não substitui o historiador nem os alarmes do Rapid SCADA**.

## Segurança

- login por sessão HTTP-only, RBAC e auditoria;
- rate limiting de login e suporte a TOTP/2FA no backend;
- API externa por token e escopos;
- provisionador Rapid isolado em socket Unix local;
- bridge industrial de leitura bloqueia funções Modbus de escrita;
- automação aceita somente ações não industriais (`notify` e `work_order`);
- START/STOP passam por confirmação explícita, Controller Pack homologado, socket local e retorno do controlador;
- SMTP, WhatsApp e acesso público devem receber credenciais/configuração reais antes do uso;
- para exposição fora da rede confiável, configure HTTPS e `RC_AUTH_COOKIE_SECURE=1`.

## Desenvolvimento

Frontend:

```bash
npm ci
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

- build cliente + SSR/Node;
- smoke test do servidor frontend;
- backend, autenticação e RBAC;
- sintaxe dos instaladores;
- ausência de `node_modules`, bytecode Python e artefatos de runtime no Git;
- ausência de séries/dados industriais demonstrativos conhecidos;
- política de Controller Packs e comandos bloqueados;
- bridge apenas para reverse TCP;
- compartilhamento reverse TCP com Unit IDs distintos;
- `CmdEnabled=false` no provisionamento Rapid.

Antes de considerar um commit apto para implantação, o CI da `main` deve estar verde.
