from pydantic import BaseModel, Field, model_validator


class GeneratorCreate(BaseModel):
    tag: str = Field(min_length=1, max_length=32)
    name: str | None = None
    customer: str | None = None
    site: str = Field(min_length=1, max_length=160)
    controller: str = Field(min_length=1, max_length=160)
    controllerType: str | None = None
    transport: str = "reverse_tcp"
    ip: str | None = None
    listenPort: int = Field(default=0, ge=0, le=65535)
    modbusUnit: int = Field(default=1, ge=1, le=247)
    rapidDeviceNum: int | None = Field(default=None, ge=1)
    enabled: bool = True

    @model_validator(mode="after")
    def normalize_controller(self):
        if not self.controllerType:
            text = self.controller.strip().lower()
            if text.startswith("comap"):
                self.controllerType = "COMAP"
            elif text.startswith("dse") or text.startswith("deep sea"):
                self.controllerType = "DSE"
            else:
                self.controllerType = "GENERIC"
        return self

    def to_db(self):
        model = self.controller.strip()
        if self.controllerType == "COMAP" and model.lower().startswith("comap "):
            model = model[6:].strip()
        if self.controllerType == "DSE" and model.lower().startswith("deep sea "):
            model = model[9:].strip()
        return {
            "tag": self.tag,
            "name": self.name or self.tag,
            "customer": self.customer or "",
            "site": self.site,
            "controller_type": self.controllerType,
            "controller_model": model,
            "transport": self.transport,
            "host": self.ip or "",
            "listen_port": self.listenPort,
            "modbus_unit": self.modbusUnit,
            "rapid_device_num": self.rapidDeviceNum,
            "enabled": self.enabled,
        }
