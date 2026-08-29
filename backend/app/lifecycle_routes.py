from __future__ import annotations

import asyncio
import json
import os

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from . import db, domain_store
from .auth import require_admin, require_remove, require_view
from .rapid import load_bindings

router = APIRouter()
PROVISION_SOCKET = os.environ.get("RC_PROVISION_SOCKET", "/run/rc-geradores/provision.sock")


def actor(user: dict) -> str:
    return user.get("email") or user.get("name") or user.get("id") or "unknown"


class ConfirmPayload(BaseModel):
    confirmation: str = Field(min_length=1, max_length=160)


def _binding(generator_id: str) -> dict | None:
    return next((item for item in load_bindings() if str(item.get("generator_id") or "") == generator_id), None)


async def _invoke(operation: str, generator_id: str) -> dict:
    if operation not in {"provision", "deprovision"}:
        raise ValueError("Operação industrial inválida")
    confirmation = "PROVISION_CONFIRMED" if operation == "provision" else "DEPROVISION_CONFIRMED"
    try:
        reader, writer = await asyncio.open_unix_connection(PROVISION_SOCKET)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Serviço de provisionamento não está disponível") from exc
    writer.write((json.dumps({"operation": operation, "generator_id": generator_id, "confirm": confirmation}) + "\n").encode())
    await writer.drain()
    try:
        raw = await asyncio.wait_for(reader.readline(), timeout=100)
    finally:
        writer.close()
        await writer.wait_closed()
    try:
        result = json.loads(raw.decode())
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Resposta inválida do serviço de ciclo de vida") from exc
    if not result.get("ok"):
        raise HTTPException(status_code=409, detail=result.get("error") or f"{operation} recusado")
    return result


@router.get("/api/generators/{generator_id}/lifecycle")
def lifecycle(generator_id: str, user: dict = Depends(require_view)):
    generator = db.get_generator(generator_id)
    if not generator:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    binding = _binding(generator["id"])
    return {
        "generatorId": generator["id"],
        "tag": generator["tag"],
        "provisioned": binding is not None,
        "binding": binding,
        "canDeleteSafely": binding is None,
    }


@router.post("/api/generators/{generator_id}/deprovision")
async def deprovision(generator_id: str, payload: ConfirmPayload, user: dict = Depends(require_admin)):
    generator = db.get_generator(generator_id)
    if not generator:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    if payload.confirmation.strip().upper() != "DEPROVISION":
        raise HTTPException(status_code=422, detail="Confirmação deve ser DEPROVISION")
    result = await _invoke("deprovision", generator["id"])
    db.add_audit(actor(user), "deprovision", "generator", generator["id"], f"historyPreserved={bool(result.get('historyPreserved'))}")
    return result


@router.post("/api/generators/{generator_id}/retire", status_code=status.HTTP_200_OK)
async def retire(generator_id: str, payload: ConfirmPayload, user: dict = Depends(require_remove)):
    generator = db.get_generator(generator_id)
    if not generator:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    expected = f"RETIRAR {generator['tag']}"
    if payload.confirmation.strip().upper() != expected.upper():
        raise HTTPException(status_code=422, detail=f"Confirmação deve ser {expected}")

    deprovision_result = None
    if _binding(generator["id"]):
        # require_remove pode não ser administrador; retirar equipamento industrial
        # exige também perfil administrador quando houver configuração ativa no Rapid.
        if str(user.get("role") or "") != "administrador":
            raise HTTPException(status_code=403, detail="Gerador provisionado só pode ser retirado por administrador")
        deprovision_result = await _invoke("deprovision", generator["id"])

    if _binding(generator["id"]):
        raise HTTPException(status_code=409, detail="Binding Rapid ainda está ativo; exclusão recusada")

    if not db.delete_generator(generator["id"], actor=actor(user)):
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    domain_store.remove_legacy_generator(generator["id"])
    db.add_audit(actor(user), "retire", "generator", generator["id"], "cadastro removido após deprovisionamento seguro")
    return {
        "ok": True,
        "generatorId": generator["id"],
        "tag": generator["tag"],
        "deprovisioned": bool(deprovision_result),
        "historyPreserved": bool((deprovision_result or {}).get("historyPreserved", True)),
    }
