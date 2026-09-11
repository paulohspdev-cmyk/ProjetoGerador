import { ScreenBody } from "./kit";
import {
  AlarmPriorityPanel,
  AttentionPanel,
  FuelPanel,
  MaintenancePanel,
  WorkPanel,
} from "./overview-dashboard-actions";
import {
  AvailabilityPanel,
  DecisionErrorBanner,
  DecisionHeader,
  DecisionStats,
  TrafficPanel,
} from "./overview-dashboard-summary";
import { useOverviewDecisionModel } from "./overview-dashboard-model";

export function OverviewDashboard() {
  const model = useOverviewDecisionModel();
  const refreshGenerators = model.retryAll;

  return (
    <ScreenBody>
      <DecisionHeader updatedAt={model.updatedAt} onRefresh={refreshGenerators} />

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

      <div className="grid gap-3 xl:grid-cols-12">
        <TrafficPanel
          loading={model.communicationLoading}
          rows={model.modemRows}
          {...(model.traffic ? { traffic: model.traffic } : {})}
          maxMonthTraffic={model.maxMonthTraffic}
          bridgeFresh={model.bridgeFresh}
        />
        <AvailabilityPanel
          generatorStatus={model.generatorStatus}
          totalGenerators={model.totalGenerators}
          bridgeFresh={model.bridgeFresh}
          modemCount={model.modemCount}
          connectedModems={model.connectedModems}
        />
        <div className="min-w-0 xl:col-span-4 [&>section]:h-full">
          <FuelPanel fuel={model.fuel} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        <AlarmPriorityPanel
          error={model.alarmError}
          alarmsOpen={model.activeAlarms.length}
          severity={model.severity}
          severityMax={model.severityMax}
        />
        <WorkPanel work={model.work} />
        <MaintenancePanel maintenance={model.maintenance} />
        <AttentionPanel error={model.alarmError} alarms={model.activeAlarms} />
      </div>
    </ScreenBody>
  );
}
