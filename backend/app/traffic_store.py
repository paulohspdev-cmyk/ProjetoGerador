from __future__ import annotations

import ipaddress
import json
import os
import time
from datetime import datetime
from pathlib import Path

from . import db

PEER_RETENTION_DAYS = max(7, int(os.environ.get("RC_RETENTION_BRIDGE_PEER_DAYS", "90")))
_TRAFFIC_DB_READY = False


def _now() -> int:
    return int(time.time())


def _day_key(timestamp: int | None = None) -> str:
    value = int(timestamp or _now())
    return datetime.fromtimestamp(value).astimezone().strftime("%Y-%m-%d")


def init_traffic_db() -> None:
    global _TRAFFIC_DB_READY
    if _TRAFFIC_DB_READY:
        return
    with db.connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS bridge_traffic_state (
                remote_port INTEGER PRIMARY KEY,
                bytes_rx INTEGER NOT NULL DEFAULT 0,
                bytes_tx INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bridge_traffic_daily (
                day TEXT NOT NULL,
                remote_port INTEGER NOT NULL,
                bytes_rx INTEGER NOT NULL DEFAULT 0,
                bytes_tx INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(day, remote_port)
            );
            CREATE INDEX IF NOT EXISTS idx_bridge_traffic_daily_day
              ON bridge_traffic_daily(day);

            CREATE TABLE IF NOT EXISTS bridge_availability_state (
                remote_port INTEGER PRIMARY KEY,
                connected INTEGER NOT NULL,
                changed_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bridge_outages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                remote_port INTEGER NOT NULL,
                started_at INTEGER NOT NULL,
                ended_at INTEGER,
                observed_reason TEXT NOT NULL DEFAULT 'tcp_disconnected'
            );
            CREATE INDEX IF NOT EXISTS idx_bridge_outages_port_time
              ON bridge_outages(remote_port, started_at DESC);

            CREATE TABLE IF NOT EXISTS bridge_peer_observations (
                remote_port INTEGER NOT NULL,
                remote_ip TEXT NOT NULL,
                first_seen_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL,
                accepted_count INTEGER NOT NULL DEFAULT 0,
                rejected_count INTEGER NOT NULL DEFAULT 0,
                last_accepted_at INTEGER,
                last_rejected_at INTEGER,
                last_decision TEXT NOT NULL,
                last_reason TEXT NOT NULL DEFAULT '',
                PRIMARY KEY(remote_port, remote_ip)
            );
            CREATE INDEX IF NOT EXISTS idx_bridge_peer_observations_last_seen
              ON bridge_peer_observations(last_seen_at DESC);
            """
        )
    _TRAFFIC_DB_READY = True


def record_bridge_peer(
    remote_port: int,
    remote_ip: str,
    accepted: bool,
    reason: str = "",
    now: int | None = None,
) -> dict:
    init_traffic_db()
    port = int(remote_port)
    if not 1 <= port <= 65535:
        raise ValueError("porta reverse TCP inválida")
    try:
        address = str(ipaddress.ip_address(str(remote_ip).strip()))
    except ValueError as exc:
        raise ValueError("IP do peer inválido") from exc

    timestamp = int(now or _now())
    accepted_count = 1 if accepted else 0
    rejected_count = 0 if accepted else 1
    decision = "accepted" if accepted else "rejected"
    clean_reason = str(reason or decision).strip()[:240]
    cutoff = timestamp - PEER_RETENTION_DAYS * 86400

    with db.connect() as conn:
        conn.execute(
            "DELETE FROM bridge_peer_observations WHERE last_seen_at < ?",
            (cutoff,),
        )
        conn.execute(
            """INSERT INTO bridge_peer_observations(
                   remote_port,remote_ip,first_seen_at,last_seen_at,
                   accepted_count,rejected_count,last_accepted_at,last_rejected_at,
                   last_decision,last_reason
               ) VALUES (?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(remote_port,remote_ip) DO UPDATE SET
                   last_seen_at=excluded.last_seen_at,
                   accepted_count=bridge_peer_observations.accepted_count + excluded.accepted_count,
                   rejected_count=bridge_peer_observations.rejected_count + excluded.rejected_count,
                   last_accepted_at=COALESCE(excluded.last_accepted_at, bridge_peer_observations.last_accepted_at),
                   last_rejected_at=COALESCE(excluded.last_rejected_at, bridge_peer_observations.last_rejected_at),
                   last_decision=excluded.last_decision,
                   last_reason=excluded.last_reason""",
            (
                port,
                address,
                timestamp,
                timestamp,
                accepted_count,
                rejected_count,
                timestamp if accepted else None,
                None if accepted else timestamp,
                decision,
                clean_reason,
            ),
        )
        row = conn.execute(
            """SELECT remote_port,remote_ip,first_seen_at,last_seen_at,
                      accepted_count,rejected_count,last_accepted_at,last_rejected_at,
                      last_decision,last_reason
               FROM bridge_peer_observations
               WHERE remote_port=? AND remote_ip=?""",
            (port, address),
        ).fetchone()
    return _peer_public(row)


def _peer_public(row) -> dict:
    return {
        "remotePort": int(row["remote_port"]),
        "remoteIp": row["remote_ip"],
        "firstSeenAt": int(row["first_seen_at"]),
        "lastSeenAt": int(row["last_seen_at"]),
        "acceptedCount": int(row["accepted_count"] or 0),
        "rejectedCount": int(row["rejected_count"] or 0),
        "lastAcceptedAt": int(row["last_accepted_at"]) if row["last_accepted_at"] else None,
        "lastRejectedAt": int(row["last_rejected_at"]) if row["last_rejected_at"] else None,
        "lastDecision": row["last_decision"],
        "lastReason": row["last_reason"] or "",
    }


def list_bridge_peers(limit: int = 200, remote_port: int | None = None) -> list[dict]:
    init_traffic_db()
    bounded = max(1, min(int(limit or 200), 500))
    params: list[int] = []
    where = ""
    if remote_port is not None:
        port = int(remote_port)
        if not 1 <= port <= 65535:
            raise ValueError("porta reverse TCP inválida")
        where = "WHERE remote_port=?"
        params.append(port)
    params.append(bounded)
    with db.connect() as conn:
        rows = conn.execute(
            f"""SELECT remote_port,remote_ip,first_seen_at,last_seen_at,
                       accepted_count,rejected_count,last_accepted_at,last_rejected_at,
                       last_decision,last_reason
                FROM bridge_peer_observations
                {where}
                ORDER BY last_seen_at DESC, remote_port, remote_ip
                LIMIT ?""",
            tuple(params),
        ).fetchall()
    return [_peer_public(row) for row in rows]


def _summary(conn, now: int) -> dict:
    today = _day_key(now)
    month = today[:7]
    today_rows = conn.execute(
        "SELECT remote_port,bytes_rx,bytes_tx FROM bridge_traffic_daily WHERE day=? ORDER BY remote_port",
        (today,),
    ).fetchall()
    month_rows = conn.execute(
        """SELECT remote_port,SUM(bytes_rx) AS bytes_rx,SUM(bytes_tx) AS bytes_tx
           FROM bridge_traffic_daily
           WHERE day LIKE ?
           GROUP BY remote_port
           ORDER BY remote_port""",
        (f"{month}-%",),
    ).fetchall()

    today_by_port = {
        int(row["remote_port"]): {
            "rx": int(row["bytes_rx"] or 0),
            "tx": int(row["bytes_tx"] or 0),
        }
        for row in today_rows
    }
    month_by_port = {
        int(row["remote_port"]): {
            "rx": int(row["bytes_rx"] or 0),
            "tx": int(row["bytes_tx"] or 0),
        }
        for row in month_rows
    }
    ports = []
    for port in sorted(set(today_by_port) | set(month_by_port)):
        today_item = today_by_port.get(port, {"rx": 0, "tx": 0})
        month_item = month_by_port.get(port, {"rx": 0, "tx": 0})
        ports.append(
            {
                "remotePort": port,
                "todayRx": today_item["rx"],
                "todayTx": today_item["tx"],
                "todayBytes": today_item["rx"] + today_item["tx"],
                "monthRx": month_item["rx"],
                "monthTx": month_item["tx"],
                "monthBytes": month_item["rx"] + month_item["tx"],
            }
        )

    today_rx = sum(item["todayRx"] for item in ports)
    today_tx = sum(item["todayTx"] for item in ports)
    month_rx = sum(item["monthRx"] for item in ports)
    month_tx = sum(item["monthTx"] for item in ports)
    return {
        "day": today,
        "month": month,
        "todayRx": today_rx,
        "todayTx": today_tx,
        "todayBytes": today_rx + today_tx,
        "monthRx": month_rx,
        "monthTx": month_tx,
        "monthBytes": month_rx + month_tx,
        "ports": ports,
        "updatedAt": now,
    }


def record_bridge_traffic(sessions: list[dict] | None, now: int | None = None) -> dict:
    init_traffic_db()
    timestamp = int(now or _now())
    day = _day_key(timestamp)
    rows = sessions if isinstance(sessions, list) else []

    with db.connect() as conn:
        for session in rows:
            try:
                remote_port = int(session.get("remotePort") or 0)
                current_rx = max(0, int(session.get("bytesRx") or 0))
                current_tx = max(0, int(session.get("bytesTx") or 0))
            except (TypeError, ValueError, AttributeError):
                continue
            if not 1 <= remote_port <= 65535:
                continue

            connected = 1 if bool(session.get("connected")) else 0
            availability = conn.execute(
                "SELECT connected,changed_at FROM bridge_availability_state WHERE remote_port=?",
                (remote_port,),
            ).fetchone()
            if not availability:
                conn.execute(
                    "INSERT INTO bridge_availability_state(remote_port,connected,changed_at,last_seen_at) VALUES (?,?,?,?)",
                    (remote_port, connected, timestamp, timestamp),
                )
                if not connected:
                    conn.execute(
                        "INSERT INTO bridge_outages(remote_port,started_at,observed_reason) VALUES (?,?,?)",
                        (remote_port, timestamp, "tcp_disconnected"),
                    )
            elif int(availability["connected"]) != connected:
                conn.execute(
                    "UPDATE bridge_availability_state SET connected=?,changed_at=?,last_seen_at=? WHERE remote_port=?",
                    (connected, timestamp, timestamp, remote_port),
                )
                if connected:
                    conn.execute(
                        "UPDATE bridge_outages SET ended_at=? WHERE remote_port=? AND ended_at IS NULL",
                        (timestamp, remote_port),
                    )
                else:
                    conn.execute(
                        "INSERT INTO bridge_outages(remote_port,started_at,observed_reason) VALUES (?,?,?)",
                        (remote_port, timestamp, "tcp_disconnected"),
                    )
            else:
                conn.execute(
                    "UPDATE bridge_availability_state SET last_seen_at=? WHERE remote_port=?",
                    (timestamp, remote_port),
                )

            previous = conn.execute(
                "SELECT bytes_rx,bytes_tx FROM bridge_traffic_state WHERE remote_port=?",
                (remote_port,),
            ).fetchone()
            if previous:
                previous_rx = max(0, int(previous["bytes_rx"] or 0))
                previous_tx = max(0, int(previous["bytes_tx"] or 0))
                delta_rx = current_rx - previous_rx if current_rx >= previous_rx else current_rx
                delta_tx = current_tx - previous_tx if current_tx >= previous_tx else current_tx
            else:
                # A primeira amostra incorpora o tráfego já contabilizado pelo
                # processo atual da bridge, em vez de começar artificialmente em zero.
                delta_rx = current_rx
                delta_tx = current_tx

            conn.execute(
                """INSERT INTO bridge_traffic_state(remote_port,bytes_rx,bytes_tx,updated_at)
                   VALUES (?,?,?,?)
                   ON CONFLICT(remote_port) DO UPDATE SET
                     bytes_rx=excluded.bytes_rx,
                     bytes_tx=excluded.bytes_tx,
                     updated_at=excluded.updated_at""",
                (remote_port, current_rx, current_tx, timestamp),
            )

            if delta_rx or delta_tx:
                conn.execute(
                    """INSERT INTO bridge_traffic_daily(day,remote_port,bytes_rx,bytes_tx,updated_at)
                       VALUES (?,?,?,?,?)
                       ON CONFLICT(day,remote_port) DO UPDATE SET
                         bytes_rx=bridge_traffic_daily.bytes_rx + excluded.bytes_rx,
                         bytes_tx=bridge_traffic_daily.bytes_tx + excluded.bytes_tx,
                         updated_at=excluded.updated_at""",
                    (day, remote_port, delta_rx, delta_tx, timestamp),
                )

        summary = _summary(conn, timestamp)
        states = conn.execute(
            "SELECT remote_port,connected,changed_at,last_seen_at FROM bridge_availability_state ORDER BY remote_port"
        ).fetchall()
        incidents = conn.execute(
            "SELECT id,remote_port,started_at,ended_at,observed_reason FROM bridge_outages ORDER BY started_at DESC LIMIT 200"
        ).fetchall()
        summary["availability"] = [dict(row) for row in states]
        summary["outages"] = [dict(row) for row in incidents]
        return summary


def traffic_summary(now: int | None = None) -> dict:
    init_traffic_db()
    timestamp = int(now or _now())
    with db.connect() as conn:
        return _summary(conn, timestamp)


def sample_status_file(path: str | Path) -> dict:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        sessions = payload.get("ports") if isinstance(payload.get("ports"), list) else []
        updated_at = int(payload.get("updatedAt") or _now())
        return record_bridge_traffic(sessions, updated_at)
    except Exception:
        return traffic_summary()
