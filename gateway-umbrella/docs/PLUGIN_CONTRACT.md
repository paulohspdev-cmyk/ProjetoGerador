# Sidecar / Adapter Contract

O core Go não incorpora implementações imaturas só para dizer que suporta um protocolo.

Um sidecar é um executável supervisionado e independente que escreve **um JSON por linha** em stdout. Logs de diagnóstico vão para stderr.

```json
{"kind":"observation","sessionId":"optional","transport":"mqtt","remoteAddr":"broker:8883","protocol":"mqtt","payload":"{\"rpm\":1500}","meta":{"topic":"rc/site/1/gen/1/telemetry","qos":1}}
```

Regras:

1. stdout contém somente dados do contrato.
2. um objeto JSON por linha.
3. o core registra o timestamp de ingestão; timestamp de origem vai em `meta`.
4. instalar um adapter nunca concede autoridade de comando.
5. lifecycle é explícito: `experimental`, `lab_validated`, `field_validated`, `production`.
6. sidecar production exige CI próprio, SBOM/licenças, fuzz/negative tests e evidência de campo.
7. secrets entram por variáveis de ambiente/secret store, nunca hardcoded.
8. crash é fail-closed; o supervisor reinicia com atraso limitado.
9. payload é limitado; binários grandes devem usar chunk/reference.
10. Command Plane é outro contrato e permanece ausente.
