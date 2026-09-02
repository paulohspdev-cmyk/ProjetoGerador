# DSE Controller Packs

Os controladores DSE usam o padrão GenComm sobre Modbus, mas a implementação varia por família, modelo e firmware. O endereço é calculado por `página * 256 + offset`.

## Estado atual

- `dse8610-mkii`: mapa documental detalhado, somente leitura e ainda não homologado em campo.
- demais modelos do catálogo: inventário seguro; precisam ser identificados pelo par fabricante/modelo e sondados antes de receber um pack operacional.

## Regra de promoção

Um pack DSE só passa para `production` depois de:

1. ler fabricante, modelo, versão GenComm e firmware no equipamento real;
2. confirmar FC03, Unit ID, transporte, ordem das palavras e sentinelas;
3. comparar todas as grandezas principais com o display físico;
4. confirmar feedback independente de motor, GCB e MCB;
5. testar cada comando isoladamente, com autorização e procedimento de retorno;
6. registrar evidência, firmware, data, técnico e equipamento.

Os registradores 4104/4105 são mantidos apenas como documentação. Nenhum pack LAB habilita escrita.
