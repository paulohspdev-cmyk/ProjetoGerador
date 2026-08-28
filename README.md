# ProjetoGerador

Plataforma RC Geradores para supervisão e operação de grupos geradores.

Este repositório contém o frontend Generator Vision original e a nova base de backend integrada ao Rapid SCADA.

## Estrutura

```text
src/                     frontend React/TanStack
public/                  ativos do frontend
backend/                 API RC Geradores (FastAPI)
rapid/                   reader, bindings e templates Rapid SCADA
controllers/             Controller Library (production e lab)
docs/                    arquitetura e auditoria
.github/workflows/       validação automática
```

## Frontend

O frontend foi importado do projeto enviado e validado com:

```bash
npm ci
npm run build
```

## Backend

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export RC_DATA_DIR="$PWD/.data"
uvicorn app.main:app --host 127.0.0.1 --port 8088 --reload
```

A documentação interativa da API fica em `/docs` durante o desenvolvimento.

## Rapid SCADA

Rapid SCADA permanece como motor industrial. A API RC lê os canais atuais pelo `rapid/reader` e `rapid/bindings.json`.

Cenários previstos:

- Modbus TCP direto na porta 502
- Modbus RTU serial
- gateway RS485/Ethernet
- VPN
- modem/DTU TCP Client usando RC Reverse TCP Bridge

## Estado atual

- Frontend importado e build validado
- Backend inicial criado
- SQLite para dados do produto
- API de geradores e dashboard criada
- adaptador Rapid SCADA criado
- InteliGen 200 mantido como primeiro Controller Pack homologado
- InteliCompact NT mantido em laboratório
- CI validando frontend e backend

Veja `docs/ARCHITECTURE.md` e `docs/FRONTEND_AUDIT.md`.
