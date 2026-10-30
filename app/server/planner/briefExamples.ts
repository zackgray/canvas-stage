/**
 * The develop prompt's two worked examples (briefPrompt.ts), in the exact v2 answer shape. Deliberately NEUTRAL (plan §1 correction
 * 6): one rustic, one sleek, neither a scene the app has run nor its launch concept, so the model learns the shape and the rules
 * (condition only when the idea implies it, camera only when the idea names it, style empty, the logline a full paragraph that keeps
 * every word of the idea) and not a scene. Each must pass the gate as it stands (briefV2.test.ts). Content only.
 */

export interface BriefExample { mode: 'light' | 'full'; idea: string; answer: Record<string, unknown> }

/** rustic, full mode: "old" in the idea gives the wheel a condition; the new jug and the potter's clothes get none; no camera words */
export const RUSTIC: BriefExample = {
  mode: 'full',
  idea: 'a potter throws a tall jug on her old kick wheel in a whitewashed village workshop on a Greek island, morning sun through the open door',
  answer: {
    logline: 'Morning in a small whitewashed village workshop on a Greek island: @potter, a woman in her fifties with her sleeves rolled to the elbow, throws a tall @jug on her old @kick_wheel. She kicks the stone flywheel and draws the wet red clay up between her hands into a tall neck. Morning sun pours through the open door from the left of frame, putting a bright edge on her forearms and the wet clay and laying long shadows across the floor. Clay dust floats in the shaft of sunlight between the door and the wheel, and soft daylight bounces off the whitewashed walls.',
    place: { setting: 'a small whitewashed pottery workshop in a Greek island village, its door open onto a bright lane', period: 'present day', season: 'summer', time: 'morning', weather: 'clear' },
    light: { key: 'morning sun through the open door', direction: 'from the left of frame, across her and the wheel', height: 'low', quality: 'hard', colour: 'warm white',
      others: 'soft daylight bouncing off the whitewashed walls', effect: 'a bright edge on her forearms and the wet clay, long shadows across the floor' },
    atmosphere: [{ what: 'clay dust', where: 'floating in the shaft of sunlight between the door and the wheel' }],
    elements: [
      { name: 'The potter', tag: 'potter', type: 'person', look: 'a woman in her fifties, sleeves rolled to the elbow, a grey linen apron over a blue cotton dress',
        materials: 'linen apron, cotton dress, wet clay on her hands and forearms', condition: '', face: 'sun-browned, focused, dark hair tied back in a scarf', supported: true },
      { name: 'Kick wheel', tag: 'kick_wheel', type: 'prop', look: 'a low wooden kick wheel with a heavy flywheel at its base',
        materials: 'oiled olive wood, an iron shaft, a stone flywheel', condition: 'old: the wood worn smooth and stained grey by years of clay', face: '', supported: true },
      { name: 'Tall jug', tag: 'jug', type: 'prop', look: 'a tall jug of wet red clay rising on the wheel',
        materials: 'wet red earthenware clay with a soft sheen', condition: '', face: '', supported: true },
    ],
    beats: [
      { who: '@potter', does: 'kicks the flywheel and the wheel picks up speed', seconds: 2, visible: 'her eyes on the clay' },
      { who: '@potter', does: 'draws the clay up between her hands into a tall neck', seconds: 3, visible: 'lips pressed together, concentrating' },
      { who: '@potter', does: 'sits back and lets the wheel slow, wiping her hands on the apron', seconds: 2, visible: 'a small satisfied smile' },
    ],
    camera: { size: '', angle: '', move: '', lensFeel: '' },
    style: '', background: '', exclude: [], warnings: [],
    developed: ['place.season', 'place.weather', 'light.direction', 'light.quality', 'light.colour', 'light.others', 'light.effect', 'atmosphere.0', 'elements.0.look', 'elements.0.face', 'elements.1.materials', 'beats'],
  },
}

/** sleek, light mode: nothing is aged (every condition ''), real modern materials named; the idea's camera move is kept */
export const SLEEK: BriefExample = {
  mode: 'light',
  idea: 'a sommelier pours red wine for a guest at the bar of a minimalist rooftop restaurant at night, rain on the glass wall behind them; slow push-in to the glass',
  answer: {
    logline: 'At night at the bar of a minimalist rooftop restaurant, @sommelier, a man in his thirties in a black waistcoat, pours red wine into a @wine_glass for @guest, a woman in her forties, rain on the glass wall behind them. Warm pendant lamps over the bar glow on their faces and put a bright highlight in the wine, while cool city light comes through the wet glass. Slow push-in to the glass.',
    place: { setting: 'the bar of a minimalist rooftop restaurant, a floor-to-ceiling glass wall onto the city', period: 'present day', season: '', time: 'night', weather: 'rain' },
    light: { key: 'warm pendant lamps over the bar', direction: 'from above, slightly in front of them', height: 'high', quality: 'soft', colour: 'warm amber',
      others: 'cool city light through the wet glass behind them', effect: 'a soft glow on their faces and a bright highlight in the wine' },
    atmosphere: [{ what: 'rain', where: 'running down the glass wall behind them' }],
    elements: [
      { name: 'Sommelier', tag: 'sommelier', type: 'person', look: 'a man in his thirties in a black waistcoat over a crisp white shirt',
        materials: 'fine black wool waistcoat, pressed white cotton shirt', condition: '', face: 'clean-shaven, calm, attentive', supported: true },
      { name: 'Guest', tag: 'guest', type: 'person', look: 'a woman in her forties in a dark green silk blouse',
        materials: 'silk blouse with a soft sheen', condition: '', face: 'amused, watching the pour', supported: true },
      { name: 'Wine glass', tag: 'wine_glass', type: 'prop', look: 'a large thin-stemmed wine glass on the bar',
        materials: 'clear crystal glass on a polished black stone bar top, a brushed steel rail', condition: '', face: '', supported: true },
    ],
    beats: [
      { who: '@sommelier', does: 'tilts the bottle and pours red wine into the glass', seconds: 3, visible: 'steady hands, eyes on the pour' },
      { who: '@guest', does: 'lifts the glass toward the light', seconds: 2, visible: 'a pleased half-smile' },
    ],
    camera: { size: '', angle: '', move: 'slow push-in to the glass', lensFeel: '' },
    style: '', background: '', exclude: [], warnings: [],
    developed: ['place.setting', 'light', 'elements.0.look', 'elements.0.materials', 'elements.0.face', 'elements.1', 'elements.2.materials', 'beats.1'],
  },
}

export const EXAMPLES: readonly BriefExample[] = [RUSTIC, SLEEK]
