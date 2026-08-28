# Backend RC Geradores

Backend inicial em FastAPI para substituir gradualmente os mocks/localStorage do frontend.

## Execução local

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8088 --reload
```

Por padrão o SQLite fica em `/var/lib/rc-geradores/rc-geradores.db`. Para desenvolvimento:

```bash
export RC_DATA_DIR="$PWD/.data"
```

## Endpoints iniciais

- `GET /api/health`
- `GET /api/generators`
- `GET /api/generators/{id}`
- `POST /api/generators`
- `DELETE /api/generators/{id}`
- `GET /api/dashboard`
- `GET /api/controller-bindings`

## Rapid SCADA

A API não faz polling Modbus diretamente. Ela lê os canais atuais do Rapid SCADA pelo projeto `rapid/reader` e usa `rapid/bindings.json` para mapear canais para o contrato do frontend.

Variáveis principais:

- `RC_RAPID_BINDINGS`
- `RC_RAPID_READER`
- `RC_RAPID_COMM_CONFIG`
- `RC_RAPID_CACHE_TTL`
- `RC_DATA_DIR`
- `RC_DB_FILE`
- `RC_CORS_ORIGINS`

Ainda não existe API de controle industrial neste backend. Isso é intencional: o próximo passo de controle deve reaproveitar o caminho privilegiado já homologado para o InteliGen 200 em vez de expor escrita Modbus genérica.
