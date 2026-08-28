from contextlib import asynccontextmanager
import sqlite3

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import CORS_ORIGINS, RAPID_BINDINGS_FILE, RAPID_COMM_CONFIG, RAPID_READER_DLL
from .rapid import dashboard, overlay_generators
from .schemas import GeneratorCreate


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(
    title="RC Geradores API",
    version="0.1.0",
    description="Backend do RC Geradores. Rapid SCADA é a fonte industrial de telemetria.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


def live_generators():
    return overlay_generators(db.list_generators())


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "rc-geradores-api",
        "rapid": {
            "bindings": str(RAPID_BINDINGS_FILE),
            "bindingsExists": RAPID_BINDINGS_FILE.exists(),
            "reader": str(RAPID_READER_DLL),
            "readerExists": RAPID_READER_DLL.exists(),
            "commConfig": str(RAPID_COMM_CONFIG),
            "commConfigExists": RAPID_COMM_CONFIG.exists(),
        },
    }


@app.get("/api/generators")
def generators_list():
    return live_generators()


@app.get("/api/generators/{generator_id}")
def generator_get(generator_id: str):
    item = next(
        (
            g
            for g in live_generators()
            if g["id"] == generator_id or g["tag"].lower() == generator_id.lower()
        ),
        None,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return item


@app.post("/api/generators", status_code=status.HTTP_201_CREATED)
def generator_create(payload: GeneratorCreate):
    try:
        created = db.create_generator(payload.to_db())
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Tag de gerador já cadastrada") from exc
    return next(g for g in overlay_generators([created]) if g["id"] == created["id"])


@app.delete("/api/generators/{generator_id}", status_code=status.HTTP_204_NO_CONTENT)
def generator_delete(generator_id: str):
    if not db.delete_generator(generator_id):
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/dashboard")
def dashboard_get():
    return dashboard(live_generators())


@app.get("/api/events")
def events_get(limit: int = 200):
    return db.list_events(limit)


@app.get("/api/audit")
def audit_get(limit: int = 200):
    return db.list_audit(limit)


@app.get("/api/controller-bindings")
def controller_bindings():
    from .rapid import load_bindings

    return load_bindings()
