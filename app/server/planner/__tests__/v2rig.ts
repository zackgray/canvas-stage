// v2 develop answers for the tests (shape: src/shared/briefContract.ts). RUN1_V2 is run 1's idea answered in the v2 shape, its light
// fields taken from Gemma's own good line that day ("low golden sunlight from behind the beekeeper, a strong rim light on her hair
// and the comb"), with run 1's split tags left in (repaired by the gate). A TEST fixture only: never a prompt example.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** run 1's refused develop answer, verbatim (qa-2026-10-25-beekeeper/03-planner-failed-run/brief.txt), and its idea */
export const RUN1_BRIEF = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'run1-brief.txt'), 'utf8')
export const RUN1_IDEA = 'Late afternoon in an autumn orchard: an old beekeeper in her seventies, grey-white hair, veil pushed back on her hat, lifts a honeycomb frame from a wooden hive; low golden sun behind her lights the comb and her hair; bees drift around her between the apple trees.'

export const RUN1_V2 = {
  logline: 'Late afternoon in an autumn orchard: @beekeeper lifts a @honeycomb frame from a @wooden hive while @bees drift around her between the apple trees.',
  place: { setting: 'an autumn apple orchard', period: '', season: 'autumn', time: 'late afternoon', weather: '' },
  light: { key: 'low golden sun', direction: 'from behind her, towards the camera', height: 'low', quality: 'hard', colour: 'warm gold', others: '',
    effect: 'a strong rim light on her hair and the comb' },
  atmosphere: [{ what: 'bees', where: 'drifting around her and the hive' }],
  elements: [
    { name: 'Beekeeper', tag: 'beekeeper', type: 'person', look: 'an old woman in her seventies, grey-white hair, a veil pushed back on her hat', materials: 'cotton smock, mesh veil, straw hat', condition: '', face: 'deeply lined, calm, grey-white hair', supported: true },
    { name: 'Honeycomb frame', tag: 'honeycomb_frame', type: 'prop', look: 'a wooden frame of capped honeycomb', materials: 'pine frame, golden wax comb', condition: '', face: '', supported: true },
    { name: 'Wooden hive', tag: 'wooden hive', type: 'prop', look: 'a wooden hive box', materials: 'painted pine boxes', condition: '', face: '', supported: true },
    { name: 'Bees', tag: 'bees', type: 'group', look: 'honeybees', materials: '', condition: '', face: '', supported: true },
  ],
  beats: [
    { who: '@beekeeper', does: 'lifts the honeycomb frame out of the hive', seconds: 2, visible: 'squinting into the sun' },
    { who: '@Beekeeper', does: 'holds the frame up to the light, the comb glowing', seconds: '2 s', visible: '' },
  ],
  camera: { size: '', angle: '', move: '', lensFeel: 'n/a' },
  style: '', background: '', exclude: [], warnings: [],
  developed: ['light.quality', 'elements.0.materials', 'beats.1'],
}

/** a sleek idea that is not a prompt example: nothing in it is old, so nothing gets a condition */
export const SLEEK_IDEA = 'an architect sets a white scale model on a glass table in a bright new studio, then steps back to look at it; low camera'
export const SLEEK_V2 = {
  logline: 'In a bright new studio, @architect sets a white @scale_model on a @glass_table, then steps back to look at it. Daylight through the tall windows from the right of frame lays clean soft shadows under the model. Low camera.',
  place: { setting: 'a bright architecture studio with white walls and tall windows', period: 'present day', season: '', time: 'day', weather: '' },
  light: { key: 'daylight through the tall windows', direction: 'from the right of frame', height: 'high', quality: 'soft', colour: 'neutral white', others: '', effect: 'clean soft shadows under the model' },
  atmosphere: [],
  elements: [
    { name: 'Architect', tag: 'architect', type: 'person', look: 'a woman in her forties in a charcoal wool coat', materials: 'charcoal wool, a cotton shirt', condition: '', face: 'composed, thoughtful', supported: true },
    { name: 'Scale model', tag: 'scale_model', type: 'prop', look: 'a white model of a tower', materials: 'white card and frosted acrylic, crisp laser-cut edges', condition: '', face: '', supported: true },
    { name: 'Glass table', tag: 'glass_table', type: 'prop', look: 'a long glass table', materials: 'clear tempered glass on brushed steel legs', condition: '', face: '', supported: true },
  ],
  beats: [
    { who: '@architect', does: 'sets the scale model down on the glass table', seconds: 2, visible: '' },
    { who: '@architect', does: 'steps back and looks at it', seconds: 2, visible: 'a slight frown of attention' },
  ],
  camera: { size: '', angle: 'low camera', move: '', lensFeel: '' },
  style: '', background: '', exclude: [], warnings: [],
  developed: ['light', 'elements.0.look', 'elements.1.materials', 'elements.2.materials'],
}
