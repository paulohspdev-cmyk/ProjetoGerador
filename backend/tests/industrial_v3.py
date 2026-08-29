import os
import tempfile
from pathlib import Path

# Isola o banco antes de importar app.config/db.
tmp = tempfile.TemporaryDirectory(prefix="rc-industrial-v3-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "industrial-v3.db")
os.environ["RC_ENABLE_IG200_CONTROL"] = "0"

from app import db, industrial_store, platform_store  # noqa: E402


db.init_db()
platform_store.init_platform_db()
industrial_store.init_industrial_db()

generator = db.create_generator(
    {
        "tag": "GEN001",
        "name": "Gerador 01",
        "customer": "",
        "site": "Site A",
        "controller_type": "COMAP",
        "controller_model": "InteliGen 200",
        "transport": "reverse_tcp",
        "host": "",
        "listen_port": 15001,
        "modbus_unit": 2,
        "rapid_device_num": 200,
        "enabled": True,
    },
    actor="test",
)

# Condição observada vira alarme persistente e evento de processo.
live = [{
    **generator,
    "status": "offline",
    "lastError": "sem sessão TCP",
    "availableMetrics": [],
    "alarms": 0,
    "runHours": 0,
}]
assert industrial_store.refresh_observed_alarms(live) == 1
alarms = industrial_store.list_alarms(True)
assert len(alarms) == 1
assert alarms[0]["code"] == "COMM_LOSS"
assert alarms[0]["severity"] == "fault"
acked = industrial_store.acknowledge_alarm(alarms[0]["alarm_key"], "admin@test")
assert acked and acked["acked_by"] == "admin@test"

# Normalização limpa o alarme e cria transição no histórico.
live[0]["status"] = "online"
assert industrial_store.refresh_observed_alarms(live) == 1
assert industrial_store.list_alarms(True) == []
events = industrial_store.list_process_events(20, generator["id"])
assert {event["event_type"] for event in events} >= {"alarm_raised", "alarm_ack", "alarm_cleared"}

# Plano por horímetro usa somente run_hours explicitamente disponível.
plan = industrial_store.create_maintenance_plan(
    {
        "generator_id": generator["id"],
        "name": "Troca de óleo",
        "interval_hours": 250,
        "warning_hours": 25,
        "last_service_hours": 1000,
    },
    "admin@test",
)
live[0]["availableMetrics"] = ["run_hours"]
live[0]["runHours"] = 1230
status = industrial_store.maintenance_status(live)
row = next(item for item in status if item["id"] == plan["id"])
assert row["state"] == "warning"
assert round(row["hour_remaining"], 1) == 20.0
completed = industrial_store.complete_maintenance(plan["id"], "admin@test", 1230, "Executada")
assert completed and completed["last_service_hours"] == 1230
assert industrial_store.list_maintenance_history(plan["id"])[0]["serviced_hours"] == 1230

# Escalonamento só enfileira notificação; nunca comando industrial.
live[0]["status"] = "offline"
industrial_store.refresh_observed_alarms(live)
policy = industrial_store.create_escalation_policy(
    {
        "name": "Falha imediata",
        "severity": "fault",
        "after_seconds": 0,
        "channel": "panel",
        "max_repeats": 1,
    },
    "admin@test",
)
assert policy["enabled"] is True
# O alarme reaberto não está reconhecido e deve gerar uma notificação.
assert industrial_store.process_escalations(live) == 1
notifications = platform_store.list_notifications(10)
assert notifications[0]["event_type"] == "industrial.alarm.escalation"
assert notifications[0]["channel"] == "panel"
# Máximo de uma repetição impede duplicação imediata.
assert industrial_store.process_escalations(live) == 0

print("RC Geradores industrial v3 smoke: OK")
tmp.cleanup()
