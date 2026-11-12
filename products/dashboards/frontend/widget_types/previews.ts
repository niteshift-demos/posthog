// Preview components render real product UI (replay player, error tracking list, charts), so they
// live apart from the catalog, which dashboardLogic imports on every page.
import { ActivityEventsWidgetPreview } from '../widgets/previews/ActivityEventsWidgetPreview'
import { ConversationsWidgetPreview } from '../widgets/previews/ConversationsWidgetPreview'
import { ErrorTrackingWidgetPreview } from '../widgets/previews/ErrorTrackingWidgetPreview'
import {
    ExperimentResultsWidgetPreview,
    ExperimentsListWidgetPreview,
} from '../widgets/previews/ExperimentsWidgetPreviews'
import { LogsWidgetPreview } from '../widgets/previews/LogsWidgetPreview'
import { SessionReplayWidgetPreview } from '../widgets/previews/SessionReplayWidgetPreview'
import { SurveyResultsWidgetPreview } from '../widgets/previews/SurveysWidgetPreviews'
import type { DashboardWidgetCatalogKey } from './catalog'

/** New widget types: add preview components here. See products/dashboards/CONTRIBUTING.md. */
export const DASHBOARD_WIDGET_PREVIEWS: Record<DashboardWidgetCatalogKey, () => JSX.Element> = {
    conversations_recent_tickets: ConversationsWidgetPreview,
    activity_events_list: ActivityEventsWidgetPreview,
    error_tracking_list: ErrorTrackingWidgetPreview,
    session_replay_list: SessionReplayWidgetPreview,
    experiments_list: ExperimentsListWidgetPreview,
    experiment_results: ExperimentResultsWidgetPreview,
    survey_results: SurveyResultsWidgetPreview,
    logs_list: LogsWidgetPreview,
}
