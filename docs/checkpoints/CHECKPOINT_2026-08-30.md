# CHECKPOINT — ProjetoGerador / RC Geradores

**Data:** 2026-08-30  
**Objetivo deste arquivo:** permitir que outra conversa, outro agente ou outra sessão continue o projeto exatamente do ponto atual, sem depender do histórico do chat.

> Este documento deve ser tratado como ponto de retomada. Antes de qualquer alteração, conferir o `main`, o commit implantado na VM e este checkpoint.

---

## 1. Repositório e estado Git

Repositório:

- `paulohspdev-cmyk/ProjetoGerador`
- branch principal: `main`

Commit de referência no momento deste checkpoint:

- `ab3bc60511ef0f8e942580a6dc7afa7309f1a576`
- merge da PR #26: `fix: seis cards por tela e encaixe vertical no fullscreen`
- CI da `main` desse commit: **SUCCESS**

### IMPORTANTE SOBRE A VM

O commit `ab3bc60511ef0f8e942580a6dc7afa7309f1a576` foi preparado e validado no Git, mas **não considerar implantado na VM até conferir**:

```bash
sudo cat /var/lib/rc-geradores/deployed-commit 2>/dev/null || true
sudo git -c safe.directory=/opt/rc-geradores -C /opt/rc-geradores rev-parse HEAD
```

A última captura visual enviada antes deste checkpoint mostrava a versão anterior com 5 cards preenchendo toda a largura. A correção mais recente volta a usar **6 posições fixas em tela grande** e recupera aproximadamente 20–25 px de altura útil.

Não assumir que a VM está em `ab3bc...` sem verificar.

---

## 2. Infraestrutura de produção conhecida

VM principal:

- Ubuntu 24.04
- usuário operacional: `scada`
- código de produção: `/opt/rc-geradores`
- frontend: Node/TanStack/Vite/React/TypeScript
- backend: FastAPI
- banco do produto: SQLite
- SCADA/histórico: Rapid SCADA 6.4.7

Serviços esperados:

- `rc-geradores-bridge`
- `rc-geradores-api`
- `rc-geradores-frontend`
- `rc-geradores-worker`
- `rc-geradores-provision`
- `scadaserver6`
- `scadacomm6`
- `nginx`

Deploy oficial deve usar apenas:

- `ops/deploy_release.sh`

O deploy faz build isolado, backup, atualização, smoke checks e rollback em caso de falha.

Não fazer alterações manuais parciais na VM se puder ser evitado. Fluxo correto: **Git -> CI -> merge -> deploy_release.sh -> validação visual/funcional**.

---

## 3. Controladores e geradores em campo

Produção atual usa ComAp InteliGen 200.

Geradores conhecidos na configuração multi-device:

- GEN002 — Rapid Device 201 — Modbus Unit 13
- GEN003 — Rapid Device 202 — Modbus Unit 14
- GEN004 — Rapid Device 203 — Modbus Unit 15
- GEN005 — Rapid Device 204 — Modbus Unit 16

Existe também o gerador original GEN001 em configuração anterior.

Uma única sessão TCP reversa é usada para os quatro IG200 no mesmo gateway/porta de campo.

### Observação de configuração histórica

Havia risco de `Device201` ainda estar com Unit 12 no `BaseDAT/device.dat` em uma instalação antiga. O código de reconcile atual foi preparado para corrigir `NumAddress`/Unit ID quando rodado, mas não declarar essa correção como aplicada na VM sem verificar.

---

## 4. Estado real dos comandos industriais

### Homologado em campo

- START: **funcionou fisicamente**
- STOP: **funcionou fisicamente**

A interface exibe retorno como:

- `comando aceito pelo controlador`

Esse feedback deve permanecer, mas somente como **texto branco forte**, sem caixa/borda/fundo e sem cobrir o símbolo do gerador.

### NÃO habilitar automaticamente

Continuam desabilitados/não homologados:

- MCB command
- GCB command
- paralleling / PRLL
- AUTO command
- TEST command
- MAN command industrial, se ainda não houver suporte homologado

Os botões visuais OFF / MAN / AUTO / TEST existem para ComAp como parte do painel visual, mas isso **não significa que os comandos industriais estejam liberados**.

Não enviar raw Modbus write frames.

Não inventar intertravamentos.

Preservar política: nenhuma automação deve ligar/desligar grupo ou disjuntor sem homologação específica.

---

## 5. Controller Pack IG200 — telemetria homologada

Pack de produção:

- `controllers/production/comap/inteligen-200/manifest.json`
- schema v3
- lifecycle/status de produção com telemetria de campo validada

Telemetria homologada atualmente:

- RPM — register 1000 — scale 1
- Voltage L1-N — 1036
- Voltage L2-N — 1037
- Voltage L3-N — 1038
- Voltage L1-L2 — 1039
- Voltage L2-L3 — 1040
- Voltage L3-L1 — 1041
- Frequency — 1045 — scale 0.01

START/STOP estão habilitados no pack; comandos perigosos permanecem desabilitados.

### Leitura de campo já observada no GEN005

Em funcionamento:

- aproximadamente 1800 rpm
- aproximadamente 60 Hz
- aproximadamente 227 V fase-neutro
- aproximadamente 393/394 V fase-fase

Essas leituras chegaram corretamente à UI.

### Candidatos de telemetria ainda NÃO promovidos como produção

Foram observados em scans read-only, mas não devem ser tratados como definitivos sem validação adicional:

- 1004 ≈ Fuel Rate
- 1005 ≈ Coolant Temp
- 1007 ≈ Oil Pressure
- 1012/1013 ≈ Run Hours
- 1083 ≈ Battery Voltage
- 1228 ≈ Nominal Power

Não confundir candidato de scan com endereço de produção homologado.

---

## 6. Problema aberto mais importante: kW real

O relógio de potência existe na UI, mas **`power_kw` ainda não está mapeado/homologado no Controller Pack IG200**.

Por isso o gauge mostra `0` visualmente quando a medição está indisponível.

Esse `0` é fallback de apresentação; não deve ser interpretado como leitura real até existir `power_kw` conhecido.

### Próximo trabalho de telemetria

Identificar o registrador real de potência ativa em condição de carga real usando somente leitura.

Ferramenta preparada:

- `ops/ig200_probe_readonly.py`

Usar somente FC03/FC04.

Idealmente comparar snapshot:

1. gerador parado;
2. gerador ligado sem carga;
3. gerador alimentando carga real em condição normal de operação.

Não fechar GCB pelo sistema apenas para descobrir kW. O estado de carga deve ocorrer por procedimento normal de campo.

Nunca derivar kW fictício de tensão/frequência.

---

## 7. Card principal — especificação visual aprovada/atual

A página `Geradores` usa cards **verticais completos**.

### Ordem do card

1. cabeçalho
2. modos da controladora
3. Power Flow vertical
4. feedback de comando em linha reservada
5. Engine Status
6. gauge de potência kW
7. Mains / Generator

### Cabeçalho

- círculo `G` do cabeçalho é o que deve ter mais destaque
- nome do gerador e modelo um pouco maiores
- o `G` do cabeçalho não deve ser confundido com o `G` do diagrama

### Modos ComAp

Logo abaixo do cabeçalho:

- OFF
- MAN
- AUTO
- TEST

Para futuros controladores DSE, usar identidade funcional correspondente ao DSE, mas mantendo a identidade visual RC Geradores.

### Power Flow

- orientação vertical
- torre/rede no topo
- MCB
- carga lateral
- GCB
- gerador `G` embaixo
- START e STOP à direita
- sem PRLL
- sem botão vermelho de paralelo
- código/lógica visual de PRLL removidos do card
- somente MCB/GCB como contatos visuais

O círculo `G` do gerador deve ter aproximadamente a mesma presença do círculo da torre. Não aumentar excessivamente.

Estado visual do anel do gerador:

- vermelho: estático
- verde: pulsante quando gerador em funcionamento

Frequência aparece ao lado do `G`; não repetir no Engine Status.

### Feedback de comando

Manter `comando aceito pelo controlador`:

- somente texto
- branco forte
- sem border
- sem background
- sem container/retângulo visível
- espaço reservado fixo para não alterar altura do card
- não pode cobrir o `G`

### Engine Status

Itens atuais:

- RPM
- Oil Pressure
- Coolant Temp.
- Fuel Level
- Battery Voltage
- Alternator Volt.
- Maintenance
- Run Hours

A linha duplicada `Generator Freq.` foi removida porque a frequência já aparece no Power Flow.

Todas as linhas devem usar:

- label à esquerda
- barra horizontal alinhada
- valor numa coluna fixa à direita

Valores numéricos desconhecidos aparecem visualmente como `0`, mas internamente devem continuar com `known=false`/indisponíveis para não transformar ausência de dado em telemetria falsa.

### Gauge de potência

Título atual ainda aparece como `GENERATOR P` no card; pode ser refinado futuramente para `POTÊNCIA` se desejado.

Gauge:

- kW como gauge principal
- valor central grande
- `Escala automática` removido
- texto `Potência indisponível` não deve aparecer visualmente
- fallback visual = 0 enquanto `power_kw` não existir

### Mains / Generator

Mostra tensões de rede e gerador.

Quando a leitura real do gerador chega, a coluna GENERATOR atualiza corretamente.

A coluna MAINS ainda pode aparecer `N/D` quando não existe canal real; não inventar 0 se semanticamente ainda se deseja diferenciar ausência de canal de rede.

---

## 8. Responsividade / grade — ponto exato onde paramos

Requisito definido pelo usuário:

### Tela grande / fullscreen

- **6 posições fixas por tela/página**
- se existem 5 geradores, ficam 5 cards + 1 posição vazia
- quando existir o sexto, ele entra sem redimensionar os cinco existentes
- não expandir 5 cards para ocupar 5 colunas de 20% cada

A PR #26 corrigiu exatamente isso.

CSS principal:

- `src/components/generators/generator-six-card.css`

Board:

- `src/components/generators/GeneratorsBoard.tsx`

A correção mais recente também recuperou aproximadamente 20–25 px de altura reduzindo apenas espaços internos para tentar eliminar o pequeno scroll vertical residual em fullscreen.

### Menores resoluções

A grade continua responsiva por breakpoints:

- celular: 1 coluna
- tablet/notebook: 2 ou 3
- desktop intermediário: 4/5
- fullscreen largo: 6 fixas

O objetivo é que o card inteiro caiba sem exigir rolagem para visualizar o final em uma tela desktop/fullscreen normal.

---

## 9. Arquivos de frontend mais relevantes neste momento

- `src/components/generators/GeneratorsBoard.tsx`
- `src/components/generators/PowerFlowCard.tsx`
- `src/components/generators/generator-six-card.css`
- CSS base do painel ComAp relacionado ao card

Não reescrever o card do zero. O layout atual foi ajustado iterativamente e está próximo do desejado. Fazer correções pequenas e verificáveis.

---

## 10. Plataforma v3 já implementada no repositório

Além do card, o repositório já possui fundação de plataforma v3:

- catálogo central ComAp/DSE com 104 modelos
- domain model `Site -> Asset -> Controller Instance -> Connection`
- assets genéricos: genset, mains, ATS, bus, BESS, engine, switchgear, light tower, pump, microgrid, field gateway etc.
- Controller Pack schema v3
- cadastro dinâmico de controladoras
- relatórios CSV/XLSX/PDF
- agendador administrativo
- API tokens
- status de integrações SMTP/WhatsApp/webhook
- reconcile de Rapid DAT/XML
- deprovision seguro com preservação de histórico

Catálogo não significa suporte industrial. Modelos sem pack de produção devem permanecer `inventory_only`/não provisionáveis.

---

## 11. Rapid SCADA — regras importantes

Provisionamento/reconcile foi preparado para:

- não renumerar canais existentes
- preservar histórico
- atualizar DeviceDAT/XML com Unit ID correto
- adicionar canais novos do pack
- manter canais antigos como orphaned quando removidos do pack
- backup/rollback

Deprovision foi preparado para:

- desativar canais, não apagar histórico
- remover Device/XML de forma segura
- remover linha somente quando não houver dispositivos usando-a
- arquivar binding retirado

Ainda evitar DELETE direto de gerador sem checar lifecycle/deprovision. Se uma próxima sessão trabalhar nisso, revisar se o guard server-side para DELETE já foi fechado completamente.

---

## 12. Coisas que NÃO devem ser feitas ao retomar

- não criar telemetria falsa
- não estimar kW
- não promover endereço Modbus só porque apareceu em mapa genérico de outro ComAp
- não habilitar MCB/GCB/PRLL/AUTO/TEST sem homologação
- não enviar raw Modbus write frames
- não editar produção diretamente antes de Git/CI
- não reescrever toda a UI quando o problema for ajuste fino
- não assumir commit implantado na VM sem verificar `deployed-commit`

---

## 13. Passo exato para retomar

### Passo 1 — verificar Git e VM

No Git:

- confirmar `main`
- confirmar CI verde

Na VM:

```bash
BASE=/opt/rc-geradores

echo "HEAD:"
sudo git -c safe.directory="$BASE" -C "$BASE" rev-parse HEAD

echo "DEPLOYED:"
sudo cat /var/lib/rc-geradores/deployed-commit 2>/dev/null || true

echo "ORIGIN/MAIN:"
sudo git -c safe.directory="$BASE" -C "$BASE" fetch origin main
sudo git -c safe.directory="$BASE" -C "$BASE" rev-parse origin/main
```

### Passo 2 — se `ab3bc...` ainda não estiver implantado

Implantar via `ops/deploy_release.sh`.

### Passo 3 — validar somente visual

Conferir:

- 6 posições fixas em fullscreen
- 5 geradores ocupando 5/6 da tela quando só existem 5
- sem scroll vertical residual ou com o mínimo possível
- feedback de comando sem caixa
- card termina completamente dentro da viewport

### Passo 4 — depois do visual

Voltar para telemetria real:

- descobrir `power_kw` do IG200 com scan read-only em carga real
- depois investigar, um por vez, Oil Pressure, Coolant Temp, Battery, Run Hours etc.
- promover somente o que for comprovado em campo/documentação

---

## 14. Regra de trabalho para próxima sessão

Trabalhar em pequenos checkpoints:

1. identificar problema concreto;
2. alterar no Git em branch;
3. abrir PR;
4. esperar CI completo;
5. mergear;
6. conferir CI da `main`;
7. implantar uma única release na VM;
8. validar com captura/telemetria real;
9. só então seguir para o próximo item.

Evitar ciclos de múltiplas mudanças grandes sem validação visual.

---

## 15. Resumo em uma frase

**O projeto está funcional com START/STOP e telemetria básica real do IG200; o card vertical está em fase final de ajuste de responsividade para 6 posições fixas em fullscreen, e o próximo grande item técnico é mapear `power_kw` real sem inventar dados.**
