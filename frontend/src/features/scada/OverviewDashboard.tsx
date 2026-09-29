import { ScreenBody } from "./kit";
import {
  AlarmPriorityPanel,
  AttentionPanel,
  FuelPanel,
  LowFuelPanel,
  MaintenancePanel,
  WorkPanel,
} from "./overview-dashboard-actions";
import {
  AvailabilityPanel,
  DecisionErrorBanner,
  DecisionHeader,
  DecisionStats,
  ModemListPanel,
  SitePanel,
  TrafficPanel,
} from "./overview-dashboard-summary";
import { useOverviewDecisionModel } from "./overview-dashboard-model";

export function OverviewDashboard() {
  const model = useOverviewDecisionModel();
  const refreshGenerators = model.retryAll;

  return (
    <ScreenBody className="rc-decision-screen">
      <DecisionHeader updatedAt={model.updatedAt} onRefresh={refreshGenerators} demo={model.demo} />

      {model.hasAnyError && <DecisionErrorBanner onRetry={model.retryAll} />}

      <DecisionStats
        bridgeFresh={model.bridgeFresh}
        connectedModems={model.connectedModems}
        modemCount={model.modemCount}
        generatorsReady={model.generatorsReady}
        generatorsError={model.generatorsError}
        totalGenerators={model.totalGenerators}
        generatorStatus={model.generatorStatus}
        alarmError={model.alarmError}
        alarmsOpen={model.activeAlarms.length}
        sitesWithAttention={model.sitesWithAttention}
        work={model.work}
        {...(model.traffic ? { traffic: model.traffic } : {})}
        fuel={model.fuel}
      />

      <div className="rc-decision-mid grid min-h-0 grid-cols-1 items-stretch gap-2 xl:grid-cols-12 xl:grid-rows-[auto_auto]">
        <TrafficPanel
          className="xl:col-span-4"
          {...(model.traffic ? { traffic: model.traffic } : {})}
        />
        <AvailabilityPanel
          className="xl:col-span-4"
          generatorStatus={model.generatorStatus}
          totalGenerators={model.totalGenerators}
          bridgeFresh={model.bridgeFresh}
          modemCount={model.modemCount}
          connectedModems={model.connectedModems}
        />
        <FuelPanel className="xl:col-span-4" fuel={model.fuel} />
        <ModemListPanel
          className="xl:col-span-4"
          loading={model.communicationLoading}
          rows={model.modemRows}
          {...(model.traffic ? { traffic: model.traffic } : {})}
          maxMonthTraffic={model.maxMonthTraffic}
          bridgeFresh={model.bridgeFresh}
        />
        <SitePanel className="xl:col-span-4" sites={model.sites} />
        <LowFuelPanel className="xl:col-span-4" rows={model.lowFuel} />
      </div>

      <div className="rc-decision-bottom grid min-h-0 gap-3 xl:grid-cols-4">
        <AlarmPriorityPanel
          error={model.alarmError}
          alarmsOpen={model.activeAlarms.length}
          severity={model.severity}
          severityMax={model.severityMax}
        />
        <WorkPanel work={model.work} />
        <MaintenancePanel maintenance={model.maintenance} />
        <AttentionPanel
          error={model.alarmError}
          alarms={model.activeAlarms}
          siteByGenerator={model.siteByGenerator}
        />
      </div>
    </ScreenBody>
  );
}
