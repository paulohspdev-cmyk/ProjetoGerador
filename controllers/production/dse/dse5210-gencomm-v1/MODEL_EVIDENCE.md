# DSE5210 — production read-only evidence

## Decision

DSE5210 is admitted for automatic Rapid SCADA provisioning **only for read-only telemetry** through a dedicated legacy GenComm v1 pack.

## Evidence

- Official DSE product/download page: https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse5210/downloads
- Official DSE datasheet confirms DSE5210 generator voltage, current, frequency, speed, oil pressure, fuel level, engine temperature, battery voltage, run hours and remote communications.
- Public copy of the DSE GenComm Communications Protocol v1.29: https://manualzz.com/doc/66262772/deep-sea-electronics-plc-5210--5220--555-manual
- The protocol explicitly states that it describes GenComm used by DSE 550, 555, **5210 and 5220**, uses Modbus RTU, and defines address = page * 256 + offset.
- The dedicated `modbus/source-registers.txt` contains only factual addresses accepted for this production pack and is SHA-256 pinned by `manifest.json`.

## Deliberate omissions

The DSE5210 pack does **not** inherit the newer shared DSE template. It does not poll `oil_temperature`, `power_kw`, `power_factor`, `engine_load`, `maintenance_hours` or `genset_kwh` because the legacy protocol marks some positions as reserved or makes derived/accumulated power data conditional. These can be added later only with model-specific evidence or field validation.

## Command boundary

All write capabilities are disabled. No GenComm system-control key is materialized. START, STOP, AUTO, MANUAL, TEST, transfer, breaker and paralleling commands remain blocked until physical homologation.

## Remaining legacy candidates

DSE5310, DSE5510, DSE5520, DSE7510 and DSE7520 have strong evidence of Modbus/GenComm communication, but the available manuals direct integrators to obtain the model-specific GenComm register table from DSE Technical Support. They remain registration-only until the exact map is obtained or independently verified against an authoritative source.
