# Arquitetura RC Geradores

## Objetivo

Manter o frontend Generator Vision como camada de experiência do produto e usar Rapid SCADA como motor industrial de aquisição, estado, histórico e alarmes.

## Camadas

```text
Controladoras / grupos geradores
  ├─ Modbus TCP direto :502
  ├─ RS485 local
  ├─ RS485 -> gateway Ethernet
  ├─ RS485 -> modem TCP Client -> Internet
  └─ VPN / outras redes industriais
            |
            v
Transportes
  ├─ Rapid SCADA direto quando o dispositivo é alcançável
  └─ RC Reverse TCP Bridge quando o modem inicia a conexão
            |
            v
Rapid SCADA Communicator
            |
            v
Rapid SCADA Server
  ├─ canais atuais
  ├─ eventos/alarmes
  └─ histórico
            |
            v
RC Geradores API
  ├─ cadastro
  ├─ usuários/RBAC
  ├─ clientes/sites
  ├─ normalização da telemetria
  ├─ manutenção/automação
  ├─ auditoria
  └─ controle homologado
            |
            v
Frontend React/TanStack existente
```

## Separação de responsabilidades

### Rapid SCADA

É a fonte industrial. Deve realizar polling Modbus, tratar canais, histórico e alarmes. Dispositivos Ethernet/Modbus TCP alcançáveis devem ser conectados diretamente pelo Communicator sempre que possível.

### RC Reverse TCP Bridge

Existe apenas para cenários em que modem/DTU é TCP Client e abre a sessão para o servidor. Ela transporta as requisições do Rapid SCADA para a sessão reversa. A porta normal do Rapid permanece somente leitura.

### RC Geradores API

Não deve virar outro mestre Modbus concorrente. Ela consulta o Rapid SCADA por meio do leitor oficial e normaliza os canais para os contratos usados pelo frontend.

### Banco RC

Guarda dados do produto: geradores, sites, clientes, usuários, permissões, configuração de conexão, manutenção, regras, integrações e auditoria. Não deve substituir o historiador industrial do Rapid SCADA.

## Controller Library

Cada modelo deve possuir um pacote descritivo separado da forma de transporte.

```text
controllers/
  production/
    comap/
      inteligen-200/
  lab/
    comap/
      intelicompact-nt/
```

Um Controller Pack poderá evoluir para gerar automaticamente template Modbus, bindings, canais, capabilities, alarmes e comandos.

## Segurança de comando

Nenhuma varredura de escrita. Nenhum comando genérico por registrador. START/STOP, mudança de modo, MCB/GCB e paralelismo só entram após documentação e homologação do modelo/firmware, com RBAC, confirmação, intertravamentos, validação de retorno e auditoria.
