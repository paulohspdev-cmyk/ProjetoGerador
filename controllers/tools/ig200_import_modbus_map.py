#!/usr/bin/env python3
"""Compatibilidade: importa export ComAp usando o importador genérico."""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from comap_import_modbus_map import main

if __name__ == "__main__":
    # Preserva o nome antigo; o modelo deve ser informado explicitamente em novos usos.
    main()
