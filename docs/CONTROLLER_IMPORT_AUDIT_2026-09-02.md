# Auditoria dos arquivos de controladoras — 2026-09-02

## Resultado

Os seis exports foram preservados dentro dos respectivos Controller Packs, com
SHA-256 validado automaticamente. O arquivo de configuração VPN foi recusado
porque contém credenciais e não pertence à biblioteca de controladoras.

| Arquivo recebido | Pack | Mapa conferido | Estado permitido |
|---|---|---:|---|
| AMF 09 Modbus | ComAp AMF 09 | 30/30 sinais | documentado / LAB |
| AMF 25 Modbus | ComAp AMF 25 | 30/30 sinais | documentado / LAB |
| IG-NT | ComAp IG-NT | 28/28 objetos | documentado / LAB |
| InteliMains | ComAp InteliMains | 19/19 objetos | documentado / LAB |
| IG4 200 Modbus | ComAp IG4 200 | 34/34 endereços/objetos; dois nomes analógicos vazios no export | produção somente leitura já validada em campo |
| in200 | ComAp InteliGen 200 | 41/41 sinais | produção conforme validação de campo existente |

## Limite da evidência

Um export confirma endereços, tipos, escalas e funções documentadas daquela
configuração/archive. Ele não comprova sozinho:

- modelo comercial exato quando o arquivo não o declara;
- firmware compatível;
- framing TCP/RTU e ordem de palavras observada no equipamento;
- valores físicos plausíveis em motor parado e em funcionamento;
- comandos, intertravamentos e retorno de execução.

Por isso AMF 09, AMF 25, IG-NT e InteliMains não foram promovidos para
produção. Os packs continuam somente leitura e com todos os comandos
desabilitados até ensaio de laboratório e validação de campo.

## Roteiro mínimo para promoção

1. registrar modelo, serial mascarado, firmware, archive e transporte;
2. testar conexão e Unit ID sem escrita;
3. conferir canais com motor parado;
4. conferir tensão, frequência, rotação, horas e estados durante operação;
5. validar valores de 32 bits e ordem de palavras;
6. provocar perda de modem e perda de controladora separadamente;
7. manter comandos bloqueados; qualquer homologação de comando exige ensaio
   dedicado, intertravamento e evidência de retorno.

## Configuração VPN

O anexo VPN contém material secreto e não foi copiado. As chaves devem ser
revogadas e substituídas nos dois lados. Em documentação futura, incluir apenas
endereços mascarados, topologia, rotas e parâmetros sem credenciais.
