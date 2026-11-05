# DEIF AGC 150 — inclusão segura (somente leitura)

## Estado da integração

- Catálogo: **DEIF / AGC 150** disponível para identificação/cadastro.
- **Sem pack de produção ou Rapid SCADA autorizado**: o modelo AGC 150 abrange variantes
  Generator, Stand-alone, PMS lite, Mains, BTB e aplicações diferentes.
- Sem validação de firmware, variante, mapa real, Unit ID, TCP port ou feedback em campo.
- **Nenhuma capability de START/STOP, mudança de modo ou GCB/MCB deve ser habilitada.**
- Medições ainda não poderão ser declaradas `online` sem resposta FC04 e comparação
  com o display físico da controladora.
- O script abaixo só envia FC04 e não modifica parâmetros.

## Preflight da VM (somente diagnóstico)

```bash
ip route get 10.60.15.107
ping -c 2 -W 2 10.60.15.107
# Disponível após integração desta branch; Unit ID precisa ser confirmado:
python3 controllers/tools/deif_agc150_probe_readonly.py --host 10.60.15.107 --port 502 --unit <UNIT_ID_CONFIRMADO>
```

O IP é o dispositivo informado pelo operador; **não é endereço a copiar no catálogo
global**. A VM usa gateway 10.10.10.1 e o caminho até a rede 10.60.15.0 deve ser
verificado no MikroTik/VPN caso haja timeout. Ping a partir de outro computador ou
do próprio roteador não valida o percurso a partir da VM.

## Pontos provisórios para identificação

Para a coluna **GEN** da tabela DEIF AGC 150, fontes de documentação de integração
apontam FC04 em endereços PDU: 501/502/503 (tensões entre fases, INT16s, V),
507 (frequência L1, INT16s, escala 0,01 Hz) e 519 (potência ativa total,
INT16s, kW). **Esses pontos são provisórios e não devem ser declarados
homologados** até confirmar a revisão do firmware e a planilha da variante instalada.
A faixa FC04 0–499 é configurável, por isso o teste usa endereços acima de 500.

## Critérios para nova etapa (pack + Rapid + cards)

1. Identificar aplicação/variante AGC 150, firmware e Unit ID na IHM.
2. Confirmar via VM a porta Modbus TCP configurada e pelo menos uma leitura FC04.
3. Validar cada endereço/escala com a planilha oficial DEIF 4189341212 e a IHM
   (RPM, kW, Hz, V, A, PF, temperaturas, pressão, combustível, horas,
   alarmes, modos, status e disjuntores **somente onde houver fonte real**).
4. Criar Controller Pack e template Rapid próprios, com ausência de leitura como N/D.
5. Testar backend, Rapid, telas vertical/compacta/lista, frescor, perda de comunicação
   e rollback antes de promover um release.
6. Tratar comandos industriais em PR **separado**, com homologação e intertravamentos.

## Fontes

- DEIF, documentação e tabela Modbus oficial: https://www.deif.com/documentation/agc-150-generator-mains-btb
- DEIF, manual servidor Modbus: https://documentation.deif.com/r/ie-150-agc-150-modbus-server-user-manual-4189341435-uk/data-tables/reference-tables
- Exemplo de monitoramento (pontos provisórios, não homologação de campo):
  https://episensor.com/devices/deif-agc-150-stand-alone
