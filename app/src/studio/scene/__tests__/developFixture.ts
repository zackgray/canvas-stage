// A Develop answer as the server returns it (DevelopResponse.brief: the flat lines plus the v2 brief they came from), neutral
// content, for the front door's tests. Nothing here reaches Cloud.
import type { SceneBrief } from '../../../shared/bibleContract'
import type { SceneBriefV2 } from '../../../shared/briefContract'

export const PASTED = 'A cook in her fifties, grey hair tied back, lifts a dented copper kettle off an old iron stove in a small farmhouse kitchen at dawn. Cold morning light comes through the window behind her, steam rises. She pours and looks out at the yard. A wooden stool by the door.'

export const V2: SceneBriefV2 = {
  logline: 'In a small farmhouse kitchen at dawn, @mara, a cook in her fifties with grey hair tied back, lifts a dented @kettle off an old iron stove. Cold morning light comes through the window behind her and steam rises from the spout. She pours and looks out at the yard; a wooden @stool stands by the door.',
  place: { setting: 'a small farmhouse kitchen', period: '', season: '', time: 'dawn', weather: '' },
  light: { key: 'cold morning light through the window', direction: 'from behind her, towards the camera', height: 'low', quality: 'soft', colour: 'pale blue', others: '', effect: 'rims her hair and lights the steam' },
  atmosphere: [{ what: 'steam', where: 'rising from the kettle spout' }],
  elements: [
    { name: 'Mara', tag: 'mara', type: 'person', look: 'a cook in her fifties in a faded blue apron over a wool dress', supported: true, materials: '', condition: '', face: 'lined, calm, grey hair tied back' },
    { name: 'Copper kettle', tag: 'kettle', type: 'prop', look: 'a dented copper kettle with a black handle', supported: true, materials: 'hammered copper, a bakelite handle', condition: 'dented with use', face: '' },
    { name: 'Wooden stool', tag: 'stool', type: 'prop', look: 'a three-legged wooden stool', supported: true, materials: 'pale pine', condition: '', face: '' },
  ],
  beats: [
    { who: '@mara', does: 'lifts @kettle off the stove', seconds: 2, visible: '' },
    { who: '@mara', does: 'pours into a cup', seconds: 2, visible: '' },
    { who: '@mara', does: 'looks out of the window at the yard', seconds: 2, visible: 'a small tired smile' },
  ],
  camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: [], developed: ['light.direction'],
  warnings: [{ element: 'Steam', issue: 'steam cannot move in 3D', swap: 'drawn in the still only' }],
}

export const DEVELOPED: SceneBrief = {
  brief: V2.logline, elements: V2.elements.map(({ name, tag, type, look, supported }) => ({ name, tag, type, look, supported })),
  lighting: 'Cold morning light through the window, from behind her.', materials: 'Hammered copper, pale pine.', background: '',
  beats: ['@mara lifts @kettle off the stove.', '@mara pours into a cup.', '@mara looks out of the window.'], warnings: V2.warnings, v2: V2,
}
