# Auditoria AZ-12 — bridge e transportes

Data: 2026-09-30  
Release observada: `20a68c2d0e146addcca708290a1564c63ffa305e`

## Inventário reverse TCP

Portas remotas observadas:

- 15001: GEN132 Unit 1 + GEN157 Unit 2;
- 15002: GEN154 Unit 13 + GEN153 Unit 14 + GEN152 Unit 15 + GEN167 Unit 16;
- 15003: GEN203 Unit 3 + GEN204 Unit 4.

Os Unit IDs são distintos dentro de cada porta compartilhada.

O banco possui índice único para identidade reverse TCP `(listen_port, modbus_unit)`, reduzindo risco de colisão cadastral.

## Estado observado

### Porta 15001

- desconectada;
- sem RX/TX ativo na amostra;
- GEN157 aparece offline/stale;
- GEN132 ainda não possui perfil/binding de telemetria de produção;
- mecanismo de backoff por Unit está ativo.

### Porta 15002

- conectada;
- unidades 13/14/15/16 com respostas recentes;
- existem timeouts históricos, mas `consecutiveTimeouts=0` na amostra;
- telemetria correspondente estava ativa.

### Porta 15003

- conectada;
- transporte remoto configurado para framing Modbus RTU;
- Units 3/4 com respostas recentes;
- houve reconexões históricas, mas comunicação estava ativa na amostra.

Os contadores são cumulativos da vida do processo e não devem ser interpretados isoladamente como falha atual.

## Segurança da bridge observada

Ativo:

- peer allowlist;
- allowlist obrigatória;
- rate limit de conexões;
- proteção de peer ativo;
- backoff por Unit;
- controle IG4 LAB desabilitado em produção.

CIDRs/endpoints específicos foram omitidos deste relatório; a auditoria confirmou apenas que a política está configurada.

## A12-001 — deploy de UI não deve reiniciar bridge

`deploy_release_v2.sh` compara `PREV_HEAD` e a release nova.

A bridge só entra no conjunto de serviços reiniciados quando o diff toca runtime/dependências explicitamente classificados como comunicação.

Para alteração puramente visual/API sem runtime da bridge:

- `BRIDGE_RESTART_NEEDED=0`;
- bridge é removida de `SWAP_SERVICES`;
- sessões reverse TCP são preservadas.

Isso está alinhado com o requisito de que alterar card Vertical/Compacto não derrube modem.

## Risco residual

A política depende da lista de caminhos do deploy permanecer correta.

Novo arquivo que passe a ser dependência real da bridge, mas não seja incluído na classificação, poderia deixar a bridge rodando código antigo após deploy.

O caminho inverso também importa: classificar arquivo irrelevante como dependência da bridge causa restart desnecessário.

Portanto a classificação precisa de teste automatizado com exemplos positivos e negativos.

## A12-002 — estado de transporte e estado industrial são eixos separados

No backend, reverse TCP pode estar:

- conectado;
- desconectado;
- com Unit em backoff;
- conectado com uma Unit respondendo e outra não.

A UI não deve reduzir isso a uma única cor de saúde do gerador.

Para suporte/diagnóstico devem existir separadamente:

- status da sessão remota;
- último RX/TX;
- status por Unit;
- telemetria Rapid;
- estado da controladora.

## Critério de fechamento AZ-12

- teste prova que PR puramente visual preserva bridge;
- teste prova que mudança real de bridge força restart;
- classificação de dependências é versionada/testada;
- dashboard de diagnóstico distingue porta, Unit e telemetria;
- nenhum IP/CIDR sensível é exposto à interface comum;
- reconexões/timeouts possuem janela/derivada, não apenas contador cumulativo.
