import csv
from pathlib import Path

from .config import DATA_DIR
from . import platform_store


def _supported(g: dict, metric: str) -> bool:
    return metric in (g.get("availableMetrics") or [])


def _rows(generators: list[dict]):
    for g in generators:
        yield [
            g.get("tag") or "",
            g.get("site") or "",
            g.get("status") or "",
            g.get("controller") or "",
            g.get("rpm") if _supported(g, "rpm") else None,
            g.get("frequency") if _supported(g, "frequency") else None,
            g.get("load") if _supported(g, "power_kw") else None,
            g.get("battery") if _supported(g, "battery_voltage") else None,
            g.get("fuelLevel") if _supported(g, "fuel_level") else None,
            g.get("runHours") if _supported(g, "run_hours") else None,
        ]


HEADERS = [
    "Gerador",
    "Site",
    "Status",
    "Controladora",
    "RPM",
    "Frequência Hz",
    "Potência kW",
    "Bateria V",
    "Combustível %",
    "Horímetro h",
]


def generate_report(report: dict, generators: list[dict]) -> dict:
    out_dir = DATA_DIR / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    fmt = str(report.get("format") or "CSV").upper()
    report_id = report["id"]

    if fmt == "CSV":
        path = out_dir / f"{report_id}.csv"
        with path.open("w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.writer(fh, delimiter=";")
            writer.writerow([report.get("name") or "Relatório RC Geradores"])
            writer.writerow(["Período informado", report.get("period") or ""])
            writer.writerow([])
            writer.writerow(HEADERS)
            for row in _rows(generators):
                writer.writerow(["" if value is None else value for value in row])
        media_type = "text/csv; charset=utf-8"

    elif fmt == "XLSX":
        from openpyxl import Workbook
        from openpyxl.styles import Font

        path = out_dir / f"{report_id}.xlsx"
        wb = Workbook()
        ws = wb.active
        ws.title = "Geradores"
        ws.append([report.get("name") or "Relatório RC Geradores"])
        ws.append(["Período informado", report.get("period") or ""])
        ws.append([])
        ws.append(HEADERS)
        for cell in ws[4]:
            cell.font = Font(bold=True)
        for row in _rows(generators):
            ws.append(row)
        ws.freeze_panes = "A5"
        for col in ws.columns:
            width = max(10, min(36, max(len(str(c.value or "")) for c in col) + 2))
            ws.column_dimensions[col[0].column_letter].width = width
        wb.save(path)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    elif fmt == "PDF":
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        path = out_dir / f"{report_id}.pdf"
        doc = SimpleDocTemplate(str(path), pagesize=landscape(A4), leftMargin=10 * mm, rightMargin=10 * mm, topMargin=10 * mm, bottomMargin=10 * mm)
        styles = getSampleStyleSheet()
        story = [
            Paragraph(report.get("name") or "Relatório RC Geradores", styles["Title"]),
            Paragraph(f"Período informado: {report.get('period') or '—'}", styles["Normal"]),
            Spacer(1, 5 * mm),
        ]
        data = [HEADERS] + [["—" if v is None else str(v) for v in row] for row in _rows(generators)]
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
    else:
        raise ValueError("Formato de relatório inválido")

    platform_store.set_report_artifact(report_id, str(path), media_type, path.stat().st_size)
    return {"path": path, "media_type": media_type, "filename": path.name, "size_bytes": path.stat().st_size}
