// The preset ScenePlans (Claude-authored, standing in for the in-app planner): genre-neutral examples built from the kit as it is,
// each on the drawn sky. presets.ts lists them as PLANS. The E114 battlefield is kept apart as a fixture (it names its own pano sky).
import type { ScenePlan } from '../contract.ts'
import battlefield from './battlefield.json' with { type: 'json' }
import openField from './open-field-day.json' with { type: 'json' }
import countryRoad from './country-road-dusk.json' with { type: 'json' }
import desert from './desert-noon.json' with { type: 'json' }
import snowy from './snowy-dawn.json' with { type: 'json' }

export const BATTLEFIELD_PLAN = battlefield as unknown as ScenePlan

export const NEW_PLANS: Record<string, ScenePlan> = {
  'open-field-day': openField as unknown as ScenePlan,
  'country-road-dusk': countryRoad as unknown as ScenePlan,
  'desert-noon': desert as unknown as ScenePlan,
  'snowy-dawn': snowy as unknown as ScenePlan,
}
