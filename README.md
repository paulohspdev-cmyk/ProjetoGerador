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

A configuração de campo originalmente validada utiliza:

```text
Reverse TCP externo: 15001
Bridge local Rapid:   127.0.0.1:25001
Modbus Unit ID:       2
Rapid Device:         200
Rapid Channels:       2001..2008
```

Porta, Unit ID e Rapid Device do primeiro IG200 podem ser definidos para **telemetria/provisionamento**. Mais de um Unit ID pode compartilhar a mesma sessão física reverse TCP; o provisionador impede identidade Modbus duplicada na mesma porta.

**Limite de segurança atual:** o caminho de controle remoto START/STOP que foi validado em campo permanece deliberadamente restrito ao **Rapid Device 200**. Um IG200 com outro Rapid Device pode ser monitorado, mas `--enable-control` será recusado para esse gerador até existir nova validação de campo do caminho de comando.

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
ops/install.sh               instalação/reaplicação da VM
ops/status.sh                diagnóstico detalhado
ops/vm-smoke.sh              teste de aceitação pós-instalação
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

Para montar apenas a plataforma e cadastrar os equipamentos depois pelo painel:

```bash
sudo bash ops/install.sh --skip-initial-generator
```

### Configurar o primeiro IG200

Exemplo com identidade de telemetria diferente da configuração de campo original:

```bash
sudo bash ops/install.sh \
  --ig200-tag GEN001 \
  --ig200-name "Gerador 01" \
  --ig200-site "Principal" \
  --ig200-port 16001 \
  --ig200-unit 3 \
  --ig200-device 210
```

Nesse exemplo o monitoramento/provisionamento pode usar Device 210, mas o controle remoto permanece desabilitado. Para o START/STOP homologado atual, mantenha Rapid Device 200.

Se a tag já existir, o instalador **preserva a identidade industrial existente** em vez de sobrescrever silenciosamente porta, Unit ID ou Rapid Device. O provisionador também recusa reutilizar um runtime binding que tenha divergido do cadastro.

### Bootstrap automatizado de administrador

Para uma instalação automatizada, a senha inicial pode vir de arquivo protegido, sem aparecer na linha de comando:

```bash
sudo install -m 600 /dev/null /root/rc-admin-password
sudo sh -c 'printf "%s\n" "SENHA_FORTE_AQUI" > /root/rc-admin-password'
sudo bash ops/install.sh --admin-password-file /root/rc-admin-password
sudo rm -f /root/rc-admin-password
```

O arquivo deve ser regular, pertencente ao root e `chmod 600` quando o bootstrap é executado como root.

## Controle remoto

Por segurança, START/STOP ficam desabilitados na primeira instalação. Depois de confirmar telemetria e comunicação do equipamento de campo, a configuração pode ser reaplicada explicitamente com:

```bash
cd /opt/rc-geradores
sudo bash ops/install.sh --enable-control
```

Isso habilita somente o caminho START/STOP do **InteliGen 200 homologado** e, na validação de campo atual, somente quando o cadastro usa **Rapid Device 200**. O bootstrap falha fechado se o controle for solicitado para outro Rapid Device. AUTO, TEST, MCB, GCB e paralelismo continuam bloqueados.

## Validação da VM

Teste de aceitação pós-instalação:

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

`rapid/bindings.json` no repositório é apenas referência canônica. Uma VM limpa não é considerada provisionada por causa desse arquivo; o runtime só é adotado quando a configuração correspondente existe de fato no Rapid SCADA.

O banco SQLite guarda cadastro e dados do produto; **não substitui o historiador nem os alarmes do Rapid SCADA**.

## Segurança

- login por sessão HTTP-only, RBAC e auditoria;
- rate limiting de login e suporte a TOTP/2FA no backend;
- API externa por token e escopos;
- provisionador Rapid isolado em socket Unix local;
- bridge industrial de leitura bloqueia funções Modbus de escrita;
- automação aceita somente ações não industriais (`notify` e `work_order`);
- START/STOP passam por confirmação explícita, Controller Pack homologado, socket local e retorno do controlador;
- START/STOP homologado falha fechado fora do Rapid Device 200 enquanto essa for a identidade validada em campo;
- bindings divergentes não são reutilizados silenciosamente;
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
- sintaxe e contrato dos instaladores;
- opções de instalação configurável;
- ausência de `node_modules`, bytecode Python e artefatos de runtime no Git;
- ausência de séries/dados industriais demonstrativos conhecidos;
- política de Controller Packs e comandos bloqueados;
- bridge apenas para reverse TCP;
- compartilhamento reverse TCP com Unit IDs distintos;
- binding runtime materializado antes de ser reutilizado;
- `CmdEnabled=false` no provisionamento Rapid.

O CI não substitui o teste em uma VM Linux real com Rapid SCADA e equipamento de campo. Antes de considerar uma implantação homologada, a `main` deve estar verde e a VM deve passar `ops/vm-smoke.sh`.
