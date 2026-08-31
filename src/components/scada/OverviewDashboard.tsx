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

  return (
    <ScreenBody>
      <DecisionHeader updatedAt={model.updatedAt} onRefresh={model.retryAll} />

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
        traffic={model.traffic}
        fuel={model.fuel}
      />

      <div className="grid gap-4 xl:grid-cols-5">
        <TrafficPanel
          loading={model.communicationLoading}
          rows={model.modemRows}
          traffic={model.traffic}
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
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FuelPanel fuel={model.fuel} />
        <AlarmPriorityPanel
          error={model.alarmError}
          alarmsOpen={model.activeAlarms.length}
          severity={model.severity}
          severityMax={model.severityMax}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <WorkPanel work={model.work} />
        <MaintenancePanel maintenance={model.maintenance} />
        <AttentionPanel error={model.alarmError} alarms={model.activeAlarms} />
      </div>
    </ScreenBody>
  );
}
