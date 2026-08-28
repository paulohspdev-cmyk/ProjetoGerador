from typing import Any

from pydantic import BaseModel, Field


class ClientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    units: int = Field(default=0, ge=0, le=100000)
    gens: int = Field(default=0, ge=0, le=100000)
    sla: str = Field(default="", max_length=40)


class SiteCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    clientId: str | None = None
    city: str = Field(default="", max_length=120)
    state: str = Field(default="", max_length=80)
    address: str = Field(default="", max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    timezone: str = Field(default="America/Sao_Paulo", max_length=80)

    def to_db(self):
        return {
            "name": self.name,
            "client_id": self.clientId,
            "city": self.city,
            "state": self.state,
            "address": self.address,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "timezone": self.timezone,
        }


class WorkOrderCreate(BaseModel):
    generatorId: str | None = None
    gen: str = Field(default="", max_length=32)
    site: str = Field(default="", max_length=160)
    type: str = Field(default="Preventiva", max_length=80)
    due: float = Field(default=0, ge=0)
    tech: str = Field(default="Equipe campo", max_length=160)
    status: str = Field(default="Planejada", max_length=40)
    description: str = Field(default="", max_length=4000)

    def to_db(self):
        return {
            "generator_id": self.generatorId,
            "gen": self.gen,
            "site": self.site,
            "type": self.type,
            "due": self.due,
            "tech": self.tech,
            "status": self.status,
            "description": self.description,
        }


class WorkOrderUpdate(BaseModel):
    type: str | None = Field(default=None, max_length=80)
    due: float | None = Field(default=None, ge=0)
    tech: str | None = Field(default=None, max_length=160)
    status: str | None = Field(default=None, max_length=40)
    description: str | None = Field(default=None, max_length=4000)


class AgendaCreate(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    when: str = Field(min_length=2, max_length=120)
    site: str = Field(default="", max_length=160)
    generatorId: str | None = None
    kind: str = Field(default="manual", max_length=40)

    def to_db(self):
        return {
            "title": self.title,
            "when": self.when,
            "site": self.site,
            "generator_id": self.generatorId,
            "kind": self.kind,
        }


class RuleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    trigger: str = Field(min_length=2, max_length=600)
    action: str = Field(min_length=2, max_length=600)


class RuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    trigger: str | None = Field(default=None, min_length=2, max_length=600)
    action: str | None = Field(default=None, min_length=2, max_length=600)
    enabled: bool | None = None

    def to_db(self):
        data = self.model_dump(exclude_unset=True)
        if "trigger" in data:
            data["trigger_text"] = data.pop("trigger")
        if "action" in data:
            data["action_text"] = data.pop("action")
        return data


class ReportCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    period: str = Field(min_length=1, max_length=120)
    format: str = Field(default="CSV", max_length=12)


class WebhookCreate(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    event: str = Field(min_length=2, max_length=120)


class WebhookUpdate(BaseModel):
    url: str | None = Field(default=None, min_length=8, max_length=2000)
    event: str | None = Field(default=None, min_length=2, max_length=120)
    status: str | None = Field(default=None, max_length=40)


class SettingUpdate(BaseModel):
    value: Any


class AlarmAckRequest(BaseModel):
    alarmKey: str = Field(min_length=1, max_length=240)
