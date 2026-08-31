from pathlib import Path

root = Path(".")


def rep(path, old, new):
    p = root / path
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'MISSING in {path}: {old[:120]!r}')
    p.write_text(s.replace(old, new))


# 1. Nunca inventar responsável de OS.
rep(
    "backend/app/ops_store.py",
    '"tech": str(data.get("tech") or "Equipe campo").strip(),',
    '"tech": str(data.get("tech") or "").strip(),',
)

# 2. Mapa: ausência de potência continua N/D, e site vazio não aparece verde.
p = root / "src/components/scada/OperationalMap.tsx"
s = p.read_text()
s = s.replace("  load: number;\n", "  load: number | null;\n")
s = s.replace(
    'function siteColor(site: SiteMapRow) {\n  if (site.offline > 0) return "var(--offline)";\n',
    'function siteColor(site: SiteMapRow) {\n  if (site.gens.length === 0) return "var(--muted-foreground)";\n  if (site.offline > 0) return "var(--offline)";\n',
)
s = s.replace(
    '''      (g) =>
        `<li class="flex items-center justify-between gap-2">
          <a href="/p/geradores/${esc(g.id)}" class="font-semibold text-primary hover:underline">${esc(g.tag)}</a>
          <span class="${g.status === "online" ? "text-online" : g.status === "alerta" ? "text-alert" : "text-offline"}">${esc(g.status)}</span>
        </li>`,
''',
    '''      (g) => {
        const status =
          g.status === "online"
            ? { label: "ONLINE", css: "text-online" }
            : g.status === "alerta"
              ? { label: "ALERTA", css: "text-alert" }
              : g.status === "offline"
                ? { label: "OFFLINE", css: "text-offline" }
                : { label: "N/D", css: "text-muted-foreground" };
        return `<li class="flex items-center justify-between gap-2">
          <a href="/p/geradores/${esc(g.id)}" class="font-semibold text-primary hover:underline">${esc(g.tag)}</a>
          <span class="${status.css}">${status.label}</span>
        </li>`;
      },
''',
)
s = s.replace(
    '''    <p class="num mt-1 text-[11px] text-muted-foreground">${site.load.toFixed(0)} kW conhecidos</p>
''',
    '''    <p class="num mt-1 text-[11px] text-muted-foreground">${site.load == null ? "Potência N/D" : `${site.load.toFixed(0)} kW medidos`}</p>
''',
)
s = s.replace(
    '''          return {
            ...site,
            gens,
            online: gens.filter((g) => g.status === "online").length,
            alerta: gens.filter((g) => g.status === "alerta").length,
            offline: gens.filter((g) => g.status === "offline").length,
            load: gens.reduce((sum, g) => sum + Number(g.load || 0), 0),
          };
''',
    '''          const measuredLoad = gens.filter(
            (g) =>
              (g.availableMetrics ?? []).includes("power_kw") &&
              g.load != null &&
              Number.isFinite(Number(g.load)),
          );
          return {
            ...site,
            gens,
            online: gens.filter((g) => g.status === "online").length,
            alerta: gens.filter((g) => g.status === "alerta").length,
            offline: gens.filter((g) => g.status === "offline").length,
            load: measuredLoad.length
              ? measuredLoad.reduce((sum, g) => sum + Number(g.load), 0)
              : null,
          };
''',
)
p.write_text(s)

# 3. Cards compactos não escondem horímetro.
p = root / "src/components/generators/generator-six-card.css"
s = p.read_text()
block = '''.generator-six-card-grid .engine-status-block .comap-engine:last-child {
  display: none;
}

'''
if block not in s:
    raise SystemExit("missing horimeter hide block")
p.write_text(s.replace(block, ""))

# 4. Linguagem operacional nas telas visíveis.
replacements = {
    "src/components/scada/energy-maint.tsx": [
        (
            "Esta tela só mostra grandezas de REDE quando o Controller Pack possui canais específicos de\n        rede. Tensão do gerador não é reutilizada como tensão da rede.",
            "A tela mostra somente medições de rede realmente disponíveis. Dados do gerador não são\n        reutilizados como se fossem dados da concessionária.",
        ),
        (
            "kW, GCB, fator de potência e outras grandezas só aparecem quando existem canais homologados\n        no pack da controladora. O IG200 atual não recebe valores inventados para completar a tela.",
            "Potência, GCB, fator de potência e outras grandezas só aparecem quando a controladora realmente\n        fornece essas medições. Valores ausentes permanecem N/D.",
        ),
        (
            "Fator de potência, pico e histórico não são calculados por estimativa. Quando os canais\n        existirem, o histórico será lido do archive do Rapid SCADA.",
            "Fator de potência, pico e histórico não são calculados por estimativa. O histórico só é\n        apresentado quando houver dados reais disponíveis.",
        ),
        (
            "Estados ATS/MCB/GCB não são inferidos por RPM. Sem canal homologado, o estado permanece N/D.",
            "Estados ATS/MCB/GCB não são inferidos por RPM. Sem informação real disponível, o estado permanece N/D.",
        ),
        (
            "Paralelismo, sincronismo e comandos de disjuntores permanecem bloqueados até homologação\n        específica da controladora.",
            "Paralelismo, sincronismo e comandos de disjuntores permanecem indisponíveis nesta versão\n        operacional.",
        ),
        (
            "O painel mostra o nível medido, mas não classifica combustível como baixo sem um limite\n        homologado no Controller Pack/configuração do equipamento.",
            "O painel mostra o nível medido, mas só classifica combustível como baixo quando existir um\n        limite configurado para o equipamento.",
        ),
        (
            '<Tone tone="muted">Medido · sem limite homologado</Tone>',
            '<Tone tone="muted">Medido · sem limite configurado</Tone>',
        ),
        (
            "A tensão é exibida somente quando medida. Saúde/baixa tensão não é inferida por um corte\n        genérico: nominal e limites devem vir do Controller Pack ou da configuração homologada do\n        equipamento.",
            "A tensão é exibida somente quando medida. Saúde e baixa tensão só são classificadas quando\n        existirem referência nominal e limites configurados para o equipamento.",
        ),
        (
            'hasMetric(r, "run_hours") ? <Pill tone="ok">Rapid SCADA</Pill> : <Pill>N/D</Pill>',
            'hasMetric(r, "run_hours") ? <Pill tone="ok">Telemetria</Pill> : <Pill>N/D</Pill>',
        ),
    ],
    "src/components/scada/equip-auto.tsx": [
        (
            '''          <p className="rounded-md border border-border p-3">
            Rapid SCADA é o mestre industrial. Reverse TCP usa bridge; Modbus
            TCP/RTU-over-TCP/serial são provisionados diretamente no Communicator.
          </p>''',
            '''          <p className="rounded-md border border-border p-3">
            Acompanhe aqui o estado de comunicação de cada gerador. Detalhes de integração ficam
            restritos às telas administrativas.
          </p>''',
        ),
        (
            '''                  <Pill tone={g.telemetrySource === "rapid_scada" ? "ok" : "muted"}>
                    {g.telemetrySource || "none"}
                  </Pill>''',
            '''                  <Pill tone={g.telemetrySource === "rapid_scada" ? "ok" : "muted"}>
                    {g.telemetrySource === "rapid_scada" ? "DISPONÍVEL" : "N/D"}
                  </Pill>''',
        ),
    ],
    "src/components/scada/ReportsV3Screen.tsx": [
        (
            "O backend exporta somente métricas disponíveis na API/Rapid SCADA. Dado não homologado\n            permanece ausente/N/D; o relatório não estima valores.",
            "O relatório usa somente dados realmente disponíveis. Informações ausentes permanecem N/D e\n            nenhum valor é estimado para completar o documento.",
        ),
    ],
    "src/components/generators/detail/GeneratorDetailBottom.tsx": [
        ("<h2>Sinais Rapid</h2>", "<h2>Disponibilidade dos sinais</h2>"),
        ("<h2>Eventos reais</h2>", "<h2>Eventos</h2>"),
        ("<span>Rapid Device</span>", "<span>Dispositivo</span>"),
        (
            '<b>{gen.telemetrySource || "none"}</b>',
            '<b>{gen.telemetrySource === "rapid_scada" ? "DISPONÍVEL" : "N/D"}</b>',
        ),
        (
            "<b>START/STOP via backend homologado</b>",
            "<b>START/STOP disponíveis conforme permissão</b>",
        ),
        ("<b>Histórico do Rapid SCADA</b>", "<b>Histórico baseado em dados reais</b>"),
    ],
    "src/components/generators/detail/GeneratorDetailOverview.tsx": [
        ('"Canal de alarmes não homologado"', '"Alarmes N/D"'),
        (
            '<BoolFlag label="Comunicação Rapid" value={comm} goodWhenTrue />',
            '<BoolFlag label="Comunicação" value={comm} goodWhenTrue />',
        ),
        (
            '<MetricCell label="Fonte" value={mainsKnown ? "Rapid SCADA" : "N/D"} />',
            '<MetricCell label="Origem" value={mainsKnown ? "Telemetria" : "N/D"} />',
        ),
        (
            'label="Fonte"\n              value={gen.telemetrySource === "rapid_scada" ? "Rapid SCADA" : "N/D"}',
            'label="Origem"\n              value={gen.telemetrySource === "rapid_scada" ? "Telemetria" : "N/D"}',
        ),
        ('label="Device"', 'label="Dispositivo"'),
    ],
    "src/components/generators/detail/GeneratorDetailElectrical.tsx": [
        (
            'label="Fonte"\n            value={gen.telemetrySource === "rapid_scada" ? "Rapid SCADA" : "N/D"}',
            'label="Origem"\n            value={gen.telemetrySource === "rapid_scada" ? "Telemetria" : "N/D"}',
        ),
        (
            'aria-label="Sem escala percentual homologada"',
            'aria-label="Sem escala percentual configurada"',
        ),
        (
            '? "Canal não homologado neste Controller Pack"\n            : "Valor real recebido do Rapid SCADA; sem escala percentual presumida"',
            '? "Informação de manutenção N/D"\n            : "Valor real disponível; sem percentual presumido"',
        ),
    ],
    "src/components/generators/power-flow/PowerFlowPrimitives.tsx": [
        (
            'title={`${item.title ?? item.label} — comando de modo ainda não homologado`}',
            'title={`${item.title ?? item.label} — função indisponível`}',
        ),
        ('"Escala nominal não homologada"', '"Escala nominal não configurada"'),
        (
            'title={`${label}: ${stateLabel}. Comando de contato ainda não homologado.`}',
            'title={`${label}: ${stateLabel}. Comando de contato indisponível.`}',
        ),
    ],
    "src/components/generators/power-flow/PowerFlowDiagram.tsx": [
        (
            'title={disabled ? "Comando não homologado" : undefined}',
            'title={disabled ? "Função indisponível" : undefined}',
        ),
    ],
    "src/components/generators/PowerFlowCard.tsx": [
        ('"Canal de alarmes não homologado"', '"Alarmes N/D"'),
        ('`${label} aceito pelo caminho homologado.`', '`${label} aceito pelo sistema.`'),
        ("Canais de tensão não homologados neste pack.", "Tensões N/D para esta controladora."),
    ],
    "src/components/generators/detail/GeneratorDetailPowerFlow.tsx": [
        ('title="Paralelismo não homologado"', 'title="Paralelismo indisponível"'),
    ],
    "src/components/generators/GeneratorTable.tsx": [
        (
            "Sem classificação de manutenção por limiar local; alertas dependem do plano/Controller\n              Pack homologado.",
            "Sem classificação local por limite fixo; alertas seguem a configuração real do equipamento.",
        ),
    ],
    "src/data/scada.ts": [
        (
            '"Controlador reporta condição de alerta; detalhes dependem dos canais homologados"',
            '"Controlador reporta condição de alerta; detalhes dependem das informações disponíveis"',
        ),
    ],
    "src/lib/auth.ts": [
        (
            "Acesso total: visualização, cadastro, usuários, auditoria e START/STOP homologados",
            "Acesso total: visualização, cadastro, usuários, auditoria e START/STOP autorizados",
        ),
    ],
}
for path, pairs in replacements.items():
    for old, new in pairs:
        rep(path, old, new)

# 5. Guardrails para impedir regressões descobertas na auditoria.
p = root / "scripts/check-functional-surfaces.mjs"
s = p.read_text()
needle = '''const backup = read("backend/app/backup_manager.py");
for (const marker of ["PRAGMA quick_check", "_pre_restore_snapshot", "_rollback_database"]) {
  if (!backup.includes(marker)) failures.push(`restore sem proteção obrigatória: ${marker}`);
}

'''
insert = '''const backup = read("backend/app/backup_manager.py");
for (const marker of ["PRAGMA quick_check", "_pre_restore_snapshot", "_rollback_database"]) {
  if (!backup.includes(marker)) failures.push(`restore sem proteção obrigatória: ${marker}`);
}

const opsStore = read("backend/app/ops_store.py");
if (opsStore.includes('data.get("tech") or "Equipe campo"')) {
  failures.push("ordem de serviço voltou a inventar responsável padrão");
}

const operationalMap = read("src/components/scada/OperationalMap.tsx");
if (operationalMap.includes("Number(g.load || 0)")) {
  failures.push("mapa voltou a converter potência ausente em zero");
}
if (!operationalMap.includes("load: measuredLoad.length")) {
  failures.push("mapa perdeu distinção entre potência medida e N/D");
}

const generatorCardCss = read("src/components/generators/generator-six-card.css");
if (generatorCardCss.includes(".engine-status-block .comap-engine:last-child")) {
  failures.push("card compacto voltou a ocultar o horímetro");
}

'''
if needle not in s:
    raise SystemExit("guardrail insertion point missing")
p.write_text(s.replace(needle, insert))

print("finalization edits applied")
