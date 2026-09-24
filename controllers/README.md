# Perfis de controladoras

Cada controladora é tratada como um pacote autocontido e passa obrigatoriamente por
`lab` antes de chegar a `production`.

## Estrutura de cada modelo

```text
controllers/<ciclo>/<fabricante>/<modelo>/
├── manifest.json        contrato consumido pelo sistema
├── modbus/              arquivos originais do fabricante ou exportados da controladora
├── templates/           artefatos gerados para o motor de telemetria
├── scripts/             código específico do modelo, somente após revisão
└── homologation/        evidências, firmware, equipamento, data e resultado dos ensaios
```

O provisionador genérico permanece em `rapid/provisioning`; ele não deve ser copiado
para cada modelo. A pasta `scripts` contém apenas comportamento que seja realmente
específico daquela controladora.

## Fluxo obrigatório

1. Receber o arquivo sem modificá-lo e registrar origem e checksum em `lab`.
2. Interpretar mapa Modbus, tipos, endianness, escalas, sentinelas e funções permitidas.
3. Gerar template somente leitura e executar validação estática.
4. Testar em bancada sem comandos.
5. Validar telemetria em campo e registrar firmware e equipamento de referência.
6. Homologar comandos individualmente, sempre bloqueados por padrão.
7. Promover o pacote completo para `production` após revisão e testes automatizados.

Arquivos recebidos nunca entram diretamente em `production`. Ausência de evidência
mantém o perfil em `lab`, sem provisionamento automático e sem comandos.
