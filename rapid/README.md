# Rapid SCADA

Integração isolada com o Rapid SCADA.

- reader/: leitor/overlay de dados.
- provisioning/: criação e remoção de bindings/dispositivos.
- templates/: templates de comunicação.

Fluxo: Controladora -> Rapid/Bridge -> Backend/API -> Frontend.
O frontend não deve acessar arquivos internos do Rapid diretamente.
