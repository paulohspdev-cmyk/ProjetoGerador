from pydantic import BaseModel, Field, model_validator


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)
    otp: str | None = Field(default=None, min_length=6, max_length=8)


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)
    role: str = Field(default="visualizacao")


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    password: str | None = Field(default=None, min_length=8, max_length=256)
    role: str | None = None
    active: bool | None = None


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
        if self.transport not in {"reverse_tcp", "modbus_tcp_direct", "rtu_over_tcp", "modbus_rtu_serial"}:
            raise ValueError("Transporte inválido")
        if self.transport == "modbus_tcp_direct" and self.listenPort == 0:
            self.listenPort = 502
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


class GeneratorUpdate(BaseModel):
    tag: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    customer: str | None = Field(default=None, max_length=160)
    site: str | None = Field(default=None, min_length=1, max_length=160)
    transport: str | None = None
    ip: str | None = None
    listenPort: int | None = Field(default=None, ge=0, le=65535)
    modbusUnit: int | None = Field(default=None, ge=1, le=247)
    rapidDeviceNum: int | None = Field(default=None, ge=1)
    enabled: bool | None = None

    @model_validator(mode="after")
    def validate_transport(self):
        if self.transport is not None and self.transport not in {"reverse_tcp", "modbus_tcp_direct", "rtu_over_tcp", "modbus_rtu_serial"}:
            raise ValueError("Transporte inválido")
        return self

    def to_db(self):
        mapping = {
            "tag": self.tag,
            "name": self.name,
            "customer": self.customer,
            "site": self.site,
            "transport": self.transport,
            "host": self.ip,
            "listen_port": self.listenPort,
            "modbus_unit": self.modbusUnit,
            "rapid_device_num": self.rapidDeviceNum,
            "enabled": self.enabled,
        }
        return {key: value for key, value in mapping.items() if value is not None}


class CommandRequest(BaseModel):
    confirmation: str = Field(min_length=1, max_length=16)
