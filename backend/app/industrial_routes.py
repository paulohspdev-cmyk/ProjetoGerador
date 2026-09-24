from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from . import db, industrial_store
from .auth import require_admin, require_create, require_edit, require_operate, require_view
from .rapid import overlay_generators

router = APIRouter()


def actor(user: dict) -> str:
    return user.get("email") or user.get("name") or user.get("id") or "unknown"


class AlarmAckPayload(BaseModel):
    alarmKey: str = Field(min_length=1, max_length=240)


class MaintenancePlanCreate(BaseModel):
    generatorId: str | None = None
    assetId: str | None = None
    name: str = Field(min_length=1, max_length=160)
    kind: str = Field(default="preventiva", max_length=80)
    intervalHours: float | None = Field(default=None, gt=0)
    intervalDays: int | None = Field(default=None, gt=0)
    warningHours: float = Field(default=25, ge=0)
    warningDays: int = Field(default=7, ge=0)
    lastServiceHours: float | None = Field(default=None, ge=0)
    lastServiceAt: int | None = None
    notes: str = Field(default="", max_length=2000)

    def to_db(self) -> dict:
        return {
            "generator_id": self.generatorId,
            "asset_id": self.assetId,
            "name": self.name,
            "kind": self.kind,
            "interval_hours": self.intervalHours,
            "interval_days": self.intervalDays,
            "warning_hours": self.warningHours,
            "warning_days": self.warningDays,
            "last_service_hours": self.lastServiceHours,
            "last_service_at": self.lastServiceAt,
            "notes": self.notes,
        }


class MaintenancePlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    kind: str | None = Field(default=None, max_length=80)
    intervalHours: float | None = Field(default=None, gt=0)
    intervalDays: int | None = Field(default=None, gt=0)
    warningHours: float | None = Field(default=None, ge=0)
    warningDays: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=2000)
    enabled: bool | None = None

    def to_db(self) -> dict:
        raw = self.model_dump(exclude_unset=True)
        mapping = {
            "intervalHours": "interval_hours",
            "intervalDays": "interval_days",
            "warningHours": "warning_hours",
            "warningDays": "warning_days",
        }
        return {mapping.get(key, key): value for key, value in raw.items()}


class MaintenanceComplete(BaseModel):
    servicedHours: float | None = Field(default=None, ge=0)
    notes: str = Field(default="", max_length=2000)


class EscalationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    severity: str = "alarm"
    afterSeconds: int = Field(default=300, ge=0, le=31536000)
    channel: str = "panel"
    destination: str = Field(default="", max_length=500)
    repeatSeconds: int = Field(default=0, ge=0, le=31536000)
    maxRepeats: int = Field(default=1, ge=1, le=100)

    def to_db(self) -> dict:
        return {
            "name": self.name,
            "severity": self.severity,
            "after_seconds": self.afterSeconds,
            "channel": self.channel,
            "destination": self.destination,
            "repeat_seconds": self.repeatSeconds,
            "max_repeats": self.maxRepeats,
        }


class EscalationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    severity: str | None = None
    afterSeconds: int | None = Field(default=None, ge=0, le=31536000)
    channel: str | None = None
    destination: str | None = Field(default=None, max_length=500)
    repeatSeconds: int | None = Field(default=None, ge=0, le=31536000)
    maxRepeats: int | None = Field(default=None, ge=1, le=100)
    enabled: bool | None = None

    def to_db(self) -> dict:
        raw = self.model_dump(exclude_unset=True)
        mapping = {
            "afterSeconds": "after_seconds",
            "repeatSeconds": "repeat_seconds",
            "maxRepeats": "max_repeats",
        }
        return {mapping.get(key, key): value for key, value in raw.items()}


@router.get("/api/industrial/alarms")
def alarms(activeOnly: bool = True, user: dict = Depends(require_view)):
    generators = overlay_generators(db.list_generators())
    industrial_store.refresh_observed_alarms(generators)
    return industrial_store.list_alarms(activeOnly)


@router.post("/api/industrial/alarms/ack")
def alarm_ack(payload: AlarmAckPayload, user: dict = Depends(require_operate)):
    item = industrial_store.acknowledge_alarm(payload.alarmKey, actor(user))
    if not item:
        raise HTTPException(status_code=404, detail="Alarme industrial não encontrado")
    return item


@router.get("/api/industrial/process-events")
def process_events(limit: int = 500, generatorId: str | None = None, severity: str | None = None, user: dict = Depends(require_view)):
    return industrial_store.list_process_events(limit, generatorId, severity)


@router.get("/api/industrial/maintenance")
def maintenance(user: dict = Depends(require_view)):
    generators = overlay_generators(db.list_generators())
    return industrial_store.maintenance_status(generators)


@router.post("/api/industrial/maintenance", status_code=status.HTTP_201_CREATED)
def maintenance_create(payload: MaintenancePlanCreate, user: dict = Depends(require_create)):
    try:
        return industrial_store.create_maintenance_plan(payload.to_db(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/api/industrial/maintenance/{item_id}")
def maintenance_update(item_id: str, payload: MaintenancePlanUpdate, user: dict = Depends(require_edit)):
    try:
        item = industrial_store.update_maintenance_plan(item_id, payload.to_db(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Plano de manutenção não encontrado")
    return item


@router.post("/api/industrial/maintenance/{item_id}/complete")
def maintenance_complete(item_id: str, payload: MaintenanceComplete, user: dict = Depends(require_edit)):
    item = industrial_store.complete_maintenance(item_id, actor(user), payload.servicedHours, payload.notes)
    if not item:
        raise HTTPException(status_code=404, detail="Plano de manutenção não encontrado")
    return item


@router.get("/api/industrial/maintenance-history")
def maintenance_history(planId: str | None = None, limit: int = 500, user: dict = Depends(require_view)):
    return industrial_store.list_maintenance_history(planId, max(1, min(limit, 2000)))


@router.get("/api/industrial/escalations")
def escalations(user: dict = Depends(require_view)):
    return industrial_store.list_escalation_policies()


@router.post("/api/industrial/escalations", status_code=status.HTTP_201_CREATED)
def escalation_create(payload: EscalationCreate, user: dict = Depends(require_admin)):
    try:
        return industrial_store.create_escalation_policy(payload.to_db(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/api/industrial/escalations/{item_id}")
def escalation_update(item_id: str, payload: EscalationUpdate, user: dict = Depends(require_admin)):
    try:
        item = industrial_store.update_escalation_policy(item_id, payload.to_db(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Política de escalonamento não encontrada")
    return item


@router.delete("/api/industrial/escalations/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def escalation_delete(item_id: str, user: dict = Depends(require_admin)):
    if not industrial_store.delete_escalation_policy(item_id, actor(user)):
        raise HTTPException(status_code=404, detail="Política de escalonamento não encontrada")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
