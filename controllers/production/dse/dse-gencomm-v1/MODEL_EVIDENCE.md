# DSE GenComm model evidence

This matrix records which DSE products may use the shared **read-only** GenComm/Modbus telemetry pack. It is documentation evidence, not field validation and not command homologation.

## Admission rule

A model is admitted only when the official Deep Sea Electronics product/download area associates the model with **Gencomm Control Keys (056-051)** and the product is a primary generating-set controller. START/STOP, operating-mode and breaker commands remain disabled until model-specific physical validation.

## Officially documented generating-set controllers

| Model | DSE classification | Official evidence |
| --- | --- | --- |
| DSE4210 | Auto Start Control Module | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse4210/downloads |
| DSE4220 | Auto Mains (Utility) Failure Control Module | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse4220/downloads |
| DSE4510 | Auto Start Control Module | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse4510/downloads |
| DSE4520 | Auto Mains (Utility) Failure Control Module | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse4520/downloads |
| DSE4610 | Auto Start Control Module | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse4610/downloads |
| DSE4620 | Auto Mains (Utility) Failure Control Module | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse4620/downloads |
| DSE6010 MKII | Auto Start Control Module | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse6010mkii/downloads |
| DSE6020 MKII | Auto Mains (Utility) Control Module | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse6020mkii/downloads |
| DSE7210 | Auto Start Control Module | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse7210/downloads |
| DSE7220 | Auto Mains (Utility) Failure Control Module | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse7220/downloads |
| DSE7310 | Auto Start Control Module | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse7310/downloads |
| DSE7320 | Auto Mains (Utility) Failure Control Module | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse7320/downloads |
| DSE7410 | Auto Start Control Module | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse7410/downloads |
| DSE7420 | Auto Mains (Utility) Failure Control Module | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse7420/downloads |
| DSE8610 | Synchronising & Load Sharing Control Module | https://www.deepseaelectronics.com/genset/load-sharing-synchronising-control-modules/dse8610/downloads |
| DSE8620 | Synchronising & Load Sharing Auto Mains Failure Control Module | https://www.deepseaelectronics.com/genset/load-sharing-synchronising-control-modules/dse8620/downloads |
| DSE8810 | Load Share Control Module | https://www.deepseaelectronics.com/genset/load-sharing-synchronising-control-modules/dse8810/downloads |

The production manifest also contains newer models already admitted before this matrix was introduced. They remain read-only and must satisfy the same contract. This file should be extended with explicit official evidence for each of them as the audit continues.

## Explicitly excluded from the genset pack

- **DSE7560** — ATS / mains controller used with DSE7510; not a primary genset controller.
- **DSE7570** — remote Sync Lock controller; not a primary genset controller.
- **DSE8660 / DSE8660 MKII** — mains / ATS controller; belongs in a future mains/ATS pack.
- **DSE8680** — generator bus-tie controller; belongs in a future bus-tie pack.
- **DSE334 / DSE335** — ATS products; remain outside generator onboarding.
- **DSE3110, DSE501, DSE5110, DSE710, DSE720** — no sufficient model-specific GenComm evidence was accepted in this audit; registration may remain available where they are gensets, but automatic Rapid provisioning is blocked.
- **DSE7510 / DSE7520 / DSE5310 / DSE5510 / DSE5520** — legacy products remain outside the shared GenComm pack until equivalent model-specific protocol evidence is recorded.

## Model-specific legacy pack admitted

- **DSE5210** — production read-only via `controllers/production/dse/dse5210-gencomm-v1`. The public GenComm v1.29 protocol explicitly names DSE5210/5220 and documents the common pages used by the dedicated template. Optional/reserved registers from newer controllers are deliberately not polled.

## Safety boundary

`status: production` for this pack means **documented read-only telemetry deployment**. `validatedTelemetry` remains empty until field evidence exists. All write capabilities remain false.
