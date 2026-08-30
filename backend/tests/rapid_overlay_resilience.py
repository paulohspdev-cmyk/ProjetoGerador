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

try:
    rapid.load_bindings = lambda: [binding]

    # Um canal inválido não pode derrubar /api/generators inteiro.
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
    assert rows[0]["status"] == "online"
    assert rows[0]["frequency"] == 60.0
    assert "rpm" in rows[0]["lastError"]

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

print("RC Geradores overlay Rapid resiliente: OK")
