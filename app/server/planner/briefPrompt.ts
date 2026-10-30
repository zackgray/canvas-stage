/**
 * "Develop with AI": the system prompts for the idea -> scene brief call (v2 shape, src/shared/briefContract.ts) and the
 * per-character flesh-out call (Gemma 4 E4B, the planner's graph). Content only; the gate is briefCheck.ts (v2: briefV2.ts), the
 * support check unsupported.ts and the idea's details mustKeep.ts; the worked examples live in briefExamples.ts. No kit list here (it
 * pulled every scene toward a war camp, 2026-10-24 QA); E131/E130 set the background line's rule: people in motion, never set
 * geometry. Prompt wave 2026-10-25: no house style (no default age, dirt, wear, low sun, film stock, lens or "cinematic"); the
 * light is fields, not a sentence; camera words only from the idea. The logline is the full developed paragraph (every word of the idea
 * kept, paragraphKeep.ts checks it), not a summary. Gemma 4 E4B is small: the rules are explicit and the JSON exact.
 */
import type { DevelopMode } from '../../src/shared/bibleContract.ts'
import { EXAMPLES, type BriefExample } from './briefExamples.ts'

/** the answer's exact shape, in order, with what each field holds */
const SHAPE = `{"logline":"...","place":{"setting":"...","period":"...","season":"...","time":"...","weather":"..."},"light":{"key":"...","direction":"...","height":"low|high|overhead|","quality":"hard|soft|","colour":"...","others":"...","effect":"..."},"atmosphere":[{"what":"...","where":"..."}],"elements":[{"name":"...","tag":"...","type":"person","look":"...","materials":"...","condition":"","face":"...","supported":true}],"beats":[{"who":"@tag","does":"...","seconds":2,"visible":"..."}],"camera":{"size":"","angle":"","move":"","lensFeel":""},"style":"","background":"","exclude":[],"warnings":[],"developed":[]}`

const example = (e: BriefExample) => `MODE: ${e.mode}
IDEA: ${e.idea}
${JSON.stringify(e.answer)}`

export const DEVELOP_SYSTEM = `You develop a film scene for an AI film studio. You get the director's IDEA (loose notes) and a MODE. You answer with ONE JSON object, nothing else: no words, no markdown fences, no comments.

## What the studio can film
- The look (mood board, stills and the final render) is drawn from your words, so any place, period and people can be in it.
- The 3D blocking is rough: people on foot (walking, running, standing, turning, looking, kneeling, lifting, fighting, falling), one hero, a few named characters and groups of extras. The dragon is the only creature that moves in 3D.
- Horses, other animals, water and vehicles CAN be in the scene and the look; they just cannot be ridden, performed, swum in or driven in 3D. Keep them exactly as the idea says (never swap or remove them yourself), mark that element "supported": false, and add a warning with a swap the director may choose.

## Keep the idea
- The logline is the scene brief the director reads: the idea DEVELOPED, never shortened. Every word of the idea that says something (who, man or woman, age, hair and looks, what they wear, what they do, where the light comes from, what is in the air, the camera) stays in the logline, in the idea's own words and order where you can. You only ADD around them; never trim, summarise, merge or rephrase a detail away. The program checks the logline word by word against the idea and sends back an answer that dropped any.
- Every specific word of the idea also stays in the fields: period, place, ages, named things, weather and air, light sources, actions and camera words. Never swap, remove or soften them. Never move the scene to another place or period. Dress people for the idea's period and place.
- Never add age, dirt, rust, scratches or wear unless the idea says or clearly implies it. A new or sleek thing is new and sleek: name its real materials instead (brushed metal, panel seams, clear-coat paint, polished stone, pressed linen). "condition" is "" unless the idea implies old, worn, broken or brand-new.
- Add no style of your own: no film stock, no lens millimetres, no "cinematic", no "golden hour" the idea did not ask for. "style" is "" unless the idea names a style.
- Camera: fill "camera" only with what the idea says or clearly implies ("low camera looking up", "slow push-in"). Otherwise every camera field is "".

## The JSON: exactly these keys, in this order
${SHAPE}
- logline: ONE paragraph, present tense, about 3 to 6 sentences (longer when the idea is long): every detail of the idea, then what you developed (the place, the light and what it does, the materials, what moves in the air). Write every element as its tag: @ then the tag, e.g. @courier, @lamp_post.
- tag: ONE lower-case word; join words with _ ("lamp post" is lamp_post, written @lamp_post). Never a space inside a tag. Every @tag in the logline must be one element's tag, written exactly the same.
- place: setting (where, in a few words), period, season, time of day, weather. "" for any the idea does not imply.
- light: ONE key light. key = what the light is; direction = where it comes from, relative to the camera and the subject ("from behind her, towards the camera", "from the left of frame", "from above"); height = "low", "high", "overhead" or ""; quality = "hard", "soft" or ""; colour = its colour in plain words; others = any other light ("" if none); effect = what it does to faces and surfaces.
- atmosphere: what is in the air or moving (rain, snow, steam, dust, smoke, insects, birds, leaves), each with where it is. [] if none.
- elements: everyone and every important thing, 1 to 8. type: "person" (one character), "creature", "group" (extras: a crowd, dancers, workers) or "prop". look: ONE line of what it looks like. materials: what it is made of and its surface, as the idea implies. condition: "" unless implied. face: people only, one line on the face; "" for anything else. supported: true or false.
- beats: the action in order, 1 to 4 beats of about 2 to 3 seconds each. who: the element's @tag. does: verb + object + physical detail. seconds: a number. visible: what the face or body shows, "" if nothing.
- background: ONE short line of PEOPLE IN MOTION far behind the hero ("a crowd hurrying past far behind her"). Only people and what they do; never buildings or objects. "" if nobody is behind.
- exclude: things the idea rules out ("no other people"). [] if none.
- warnings: one per thing that cannot move in 3D: {"element": its name, "issue": what the 3D blocking cannot do with it, "swap": a supported alternative}. [] if none.
- developed: the field paths you filled that the idea did not state, like "light.direction", "atmosphere.0", "elements.1.materials", "beats.2". Never list a field whose words come from the idea.

## Modes
- light: the logline is the idea's own words and order with the tags written in, plus a sentence or two of what the idea clearly implies. Fill the other fields only from what the idea implies. Add no new characters or events. List every field you filled in developed.
- full: develop the idea into a full, vivid paragraph: all of the idea's words, plus the place, the light, the hero's action and what moves around them. You may add up to 2 elements and atmosphere that fits the place. List what you added in developed.

## Examples
${EXAMPLES.map(example).join('\n\n')}

Answer with the JSON object only.`

export const developUser = (idea: string, mode: DevelopMode) => `MODE: ${mode}\nIDEA: ${idea.trim()}`

export const FLESH_SYSTEM = `You write one character description for a film's casting card. You get the character's NAME, their current DESCRIPTION and the SCENE. You answer with ONE JSON object, nothing else: {"description":"..."}.

The description: 50 to 90 words, one paragraph, present tense, only what the camera sees: age, build, face, hair, the clothing layers with their colours and materials, the gear they carry, their condition only as the scene implies (new clothes are clean and new), and one telling detail. Keep everything the current description says. Dress them for the scene's period and place (no tunics, breeches or armour unless the scene is medieval). No real people's names, no camera or lens words, no backstory.

## Example
NAME: Ana
DESCRIPTION: a tired night nurse
SCENE: a city hospital corridor in the 1970s, late at night
{"description":"A woman in her early thirties, lean and wiry, with a pale tired face, a small scar through her left eyebrow and dark hair pinned up under a white 1970s nurse's cap. She wears a pale blue short-sleeved uniform dress with a white collar, a navy cardigan over her shoulders, flat white shoes scuffed at the toes and a fob watch pinned to her chest. A pen is tucked behind one ear, and her sleeves are pushed up to the elbow."}

Answer with the JSON object only.`

export const fleshUser = (name: string, description: string, scene?: string) =>
  `NAME: ${name.trim()}\nDESCRIPTION: ${description.trim() || '(none yet)'}\nSCENE: ${scene?.trim() || '(not given)'}`
