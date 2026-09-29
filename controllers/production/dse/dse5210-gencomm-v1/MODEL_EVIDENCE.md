# DSE5210 / DSE5220 — production read-only evidence

## Decision

DSE5210 e DSE5220 são admitidos para provisionamento automático no Rapid SCADA **somente para telemetria read-only**, por um pack dedicado à geração legacy GenComm v1.

## Evidence

- DSE5210 official product/download page: https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse5210/downloads
- DSE5220 official product/download page: https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse5220/downloads
- Public copy of DSE GenComm Communications Protocol v1.29: https://manualzz.com/doc/66262772/deep-sea-electronics-plc-5210--5220--555-manual
- O protocolo declara explicitamente uso de GenComm pelos DSE 550, 555, **5210 e 5220**, via Modbus RTU, com endereço = page * 256 + offset.
- `modbus/source-registers.txt` contém somente os endereços comuns aceitos para este pack e permanece SHA-256 pinned no manifest.

## Deliberate omissions

O pack legacy não herda o template DSE moderno. Ele não presume `oil_temperature`, `power_kw`, `power_factor`, `engine_load`, `maintenance_hours` ou `genset_kwh` quando o protocolo legacy não garante esses pontos comuns.

## Command boundary

Todas as capacidades de escrita permanecem desabilitadas. START, STOP, AUTO, MANUAL, TEST, transferências, disjuntores e paralelismo só podem ser promovidos após homologação física específica.

## Remaining legacy candidates

DSE5310, DSE5510, DSE5520, DSE7510 e DSE7520 têm evidência de comunicação, mas os materiais disponíveis direcionam o integrador ao mapa GenComm específico. Permanecem registration-only até obtermos tabela autoritativa ou validação independente suficiente.
