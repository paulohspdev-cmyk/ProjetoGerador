from app import rapid


generator = {
    "id": "gen-test",
    "tag": "GEN001",
    "name": "Gerador 1",
    "customer": "",
    "site": "Unidade Teste",
    "controller_type": "COMAP",
    "controller_model": "InteliGen 200",
    "transport": "reverse_tcp",
    "host": "",
    "listen_port": 15001,
    "modbus_unit": 1,
    "rapid_device_num": 200,
    "enabled": True,
}

binding = {
    "generator_id": generator["id"],
    "tag": generator["tag"],
    "controller_type": "COMAP",
    "controller_model": "InteliGen 200",
    "transport": "reverse_tcp",
    "listen_port": 15001,
    "modbus_unit": 1,
    "rapid_device_num": 200,
    "channels": {
        "rpm": {"cnl": 1001, "scale": 1},
        "frequency": {"cnl": 1002, "scale": 1},
    },
}

original_load_bindings = rapid.load_bindings
original_read_channels = rapid.read_channels
original_bridge_status = rapid._load_bridge_status
original_get_snapshot = rapid.db.get_telemetry_snapshot
original_save_snapshot = rapid.db.save_telemetry_snapshot
snapshots = {}

try:
    rapid.load_bindings = lambda: [binding]
    rapid.db.get_telemetry_snapshot = lambda generator_id: snapshots.get(generator_id)
    rapid.db.save_telemetry_snapshot = lambda generator_id, values, defined: snapshots.update(
        {
            generator_id: {
                "values": {**snapshots.get(generator_id, {}).get("values", {}), **values},
                "defined": sorted(
                    set(snapshots.get(generator_id, {}).get("defined", [])) | set(defined)
                ),
                "updated_at": 123456789,
            }
        }
    )
    rapid._load_bridge_status = lambda: {
        "updatedAt": 9999999999,
        "ports": [
            {
                "remotePort": 15001,
                "connected": True,
                "lastRxAt": 9999999999,
                "lastTxAt": 9999999999,
                "timeouts": 0,
                "errors": 0,
            }
        ],
    }

    # Um canal periférico válido não pode declarar a controladora ONLINE quando
    # a métrica de saúde configurada (RPM) está inválida.
    rapid.read_channels = lambda _nums: (
        {
            1001: {"val": None, "stat": 1, "defined": True},
            1002: {"val": 60.0, "stat": 1, "defined": True},
        },
        "",
    )
    rows = rapid.overlay_generators([generator])
    assert len(rows) == 1
    assert rows[0]["tag"] == "GEN001"
    assert rows[0]["status"] == "alerta"
    assert rows[0]["frequency"] == 60.0
    assert rows[0]["health"]["transport"] == "connected"
    assert rows[0]["health"]["controller"] == "partial"
    assert "rpm" in rows[0]["lastError"]

    # Com uma métrica de saúde válida, o mesmo equipamento pode ficar ONLINE.
    rapid.read_channels = lambda _nums: (
        {
            1001: {"val": 1500, "stat": 1, "defined": True},
            1002: {"val": 60.0, "stat": 1, "defined": True},
        },
        "",
    )
    rows = rapid.overlay_generators([generator])
    assert rows[0]["status"] == "online"
    assert rows[0]["health"]["controller"] == "responding"

    # Ao perder comunicação, valores históricos permanecem disponíveis sem
    # declarar motor, disjuntores ou fluxo como telemetria atual.
    rapid.read_channels = lambda _nums: ({}, "falha de comunicação sintética")
    rows = rapid.overlay_generators([generator])
    assert rows[0]["status"] in {"offline", "alerta"}
    assert rows[0]["rpm"] == 1500
    assert rows[0]["frequency"] == 60.0
    assert rows[0]["telemetryStale"] is True
    assert rows[0]["definedMetrics"] == []
    assert rows[0]["telemetrySource"] == "last_known"

    # Um binding pertencente a outro generator_id jamais pode ser adotado só por
    # coincidir porta, Unit e Rapid Device.
    foreign = {**binding, "generator_id": "gen-other"}
    assert rapid.binding_for(generator, [foreign]) is None

    # Binding legado sem dono continua migrável quando a identidade inteira bate.
    legacy = {**binding}
    legacy.pop("generator_id")
    assert rapid.binding_for(generator, [legacy]) is legacy

    # Mesmo uma exceção inesperada de binding/leitor deve preservar o inventário.
    rapid.load_bindings = lambda: (_ for _ in ()).throw(RuntimeError("falha sintética"))
    rows = rapid.overlay_generators([generator])
    assert len(rows) == 1
    assert rows[0]["tag"] == "GEN001"
    assert rows[0]["status"] == "offline"
    assert "Telemetria Rapid indisponível" in rows[0]["lastError"]
finally:
    rapid.load_bindings = original_load_bindings
    rapid.read_channels = original_read_channels
    rapid._load_bridge_status = original_bridge_status
    rapid.db.get_telemetry_snapshot = original_get_snapshot
    rapid.db.save_telemetry_snapshot = original_save_snapshot

print("RC Geradores overlay Rapid resiliente: OK")
