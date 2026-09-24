import csv
import html
import os
import time
import uuid
from pathlib import Path

from .config import DATA_DIR
from . import ops_store, platform_store


def _supported(g: dict, metric: str) -> bool:
    if g.get("telemetryStale"):
        return False
    metrics = g.get("definedMetrics")
    if metrics is None:
        metrics = g.get("availableMetrics") or []
    return metric in metrics


def _safe_text(value) -> str:
    text = str(value or "")
    # Neutralize spreadsheet formula interpretation for user-controlled text.
    if text[:1] in {"=", "+", "-", "@", "\t", "\r"}:
        return "'" + text
    return text


def _rows(generators: list[dict]):
    for g in generators:
        yield [
            _safe_text(g.get("tag")),
            _safe_text(g.get("site")),
            _safe_text(g.get("status")),
            _safe_text(g.get("controller")),
            g.get("rpm") if _supported(g, "rpm") else None,
            g.get("frequency") if _supported(g, "frequency") else None,
            g.get("load") if _supported(g, "power_kw") else None,
            g.get("battery") if _supported(g, "battery_voltage") else None,
            g.get("fuelLevel") if _supported(g, "fuel_level") else None,
            (g.get("metricUnits") or {}).get("fuel_level") if _supported(g, "fuel_level") else None,
            g.get("runHours") if _supported(g, "run_hours") else None,
        ]


def safe_report_artifact_path(value: str | Path) -> Path:
    reports_dir = (DATA_DIR / "reports").resolve()
    path = Path(value).resolve()
    try:
        path.relative_to(reports_dir)
    except ValueError as exc:
        raise ValueError("Artefato de relatório fora do diretório protegido") from exc
    return path


HEADERS = [
    "Gerador",
    "Site",
    "Status",
    "Controladora",
    "RPM",
    "Frequência Hz",
    "Potência kW",
    "Bateria V",
    "Combustível",
    "Unidade combustível",
    "Horímetro h",
]


def generate_report(report: dict, generators: list[dict]) -> dict:
    out_dir = DATA_DIR / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    fmt = str(report.get("format") or "CSV").upper()
    report_id = report["id"]
    generated_at = int(time.time())
    generated_label = time.strftime("%d/%m/%Y %H:%M:%S", time.localtime(generated_at))
    title = _safe_text(report.get("name") or "Relatório RC Geradores")

    extension = {"CSV": "csv", "XLSX": "xlsx", "PDF": "pdf"}.get(fmt)
    if not extension:
        ops_store.set_report_status(report_id, "Falha")
        raise ValueError("Formato de relatório inválido")

    path = out_dir / f"{report_id}.{extension}"
    temporary = out_dir / f".{report_id}.{uuid.uuid4().hex}.{extension}.tmp"
    ops_store.set_report_status(report_id, "Gerando")

    try:
        if fmt == "CSV":
            with temporary.open("w", encoding="utf-8-sig", newline="") as fh:
                writer = csv.writer(fh, delimiter=";")
                writer.writerow([title])
                writer.writerow(["Tipo", "Fotografia operacional"])
                writer.writerow(["Gerado em", generated_label])
                writer.writerow([])
                writer.writerow(HEADERS)
                for row in _rows(generators):
                    writer.writerow(["" if value is None else value for value in row])
            media_type = "text/csv; charset=utf-8"

        elif fmt == "XLSX":
            from openpyxl import Workbook
            from openpyxl.styles import Font

            wb = Workbook()
            ws = wb.active
            ws.title = "Geradores"
            ws.append([title])
            ws.append(["Tipo", "Fotografia operacional"])
            ws.append(["Gerado em", generated_label])
            ws.append([])
            ws.append(HEADERS)
            for cell in ws[5]:
                cell.font = Font(bold=True)
            for row in _rows(generators):
                ws.append(row)
            ws.freeze_panes = "A6"
            for col in ws.columns:
                width = max(10, min(36, max(len(str(cell.value or "")) for cell in col) + 2))
                ws.column_dimensions[col[0].column_letter].width = width
            wb.save(temporary)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        else:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.lib.units import mm
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

            doc = SimpleDocTemplate(
                str(temporary),
                pagesize=landscape(A4),
                leftMargin=10 * mm,
                rightMargin=10 * mm,
                topMargin=10 * mm,
                bottomMargin=10 * mm,
            )
            styles = getSampleStyleSheet()
            story = [
                Paragraph(html.escape(title), styles["Title"]),
                Paragraph("Tipo: fotografia operacional", styles["Normal"]),
                Paragraph(f"Gerado em: {generated_label}", styles["Normal"]),
                Spacer(1, 5 * mm),
            ]
            data = [HEADERS] + [
                ["—" if value is None else str(value) for value in row]
                for row in _rows(generators)
            ]
            table = Table(data, repeatRows=1, hAlign="LEFT")
            table.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 7),
                        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
                        ("TOPPADDING", (0, 0), (-1, 0), 5),
                    ]
                )
            )
            story.append(table)
            doc.build(story)
            media_type = "application/pdf"

        size = temporary.stat().st_size
        if size <= 0:
            raise RuntimeError("Relatório gerado vazio")
        os.replace(temporary, path)
        platform_store.set_report_artifact(report_id, str(path), media_type, path.stat().st_size)
        ops_store.set_report_status(report_id, "Pronto")
        return {
            "path": path,
            "media_type": media_type,
            "filename": path.name,
            "size_bytes": path.stat().st_size,
        }
    except Exception:
        temporary.unlink(missing_ok=True)
        ops_store.set_report_status(report_id, "Falha")
        raise
