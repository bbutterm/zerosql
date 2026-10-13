#!/usr/bin/env node
/**
 * Арт-промпты ZeroSQL «Полынья» — единственный источник для:
 *   docs/production/prompts.csv  — по строке на каждое изображение (портреты, фоны, референсы)
 *   docs/production/ART_BIBLE.md — блок между маркерами <!-- art-prompts:begin --> и <!-- art-prompts:end -->
 *
 * Запуск: `npm run manifest` (вызывает этот модуль) или `node scripts/art-prompts.mjs`.
 * Правьте промпты ЗДЕСЬ, а не в CSV и не внутри маркеров ART_BIBLE: оба перезаписываются.
 * Список локаций (id, подписи, запасные картины) — не здесь, а в src/data/locations.json: его же
 * читает игра. Здесь к нему по id добавляется арт (LOCATION_ART).
 *
 * Канон: GAME_DESIGN.md §1.5 (палитра, стиль), §2 (внешность), §11.1 (слоты), §11.2 (спецификация);
 * UI_ART_DIRECTION.md §7.14–7.15 (кадр в диалоге), §13 (ТЗ на живопись).
 * Промпты — по-английски (модели понимают его лучше), пояснения — по-русски.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "production");

// ─── Размеры ────────────────────────────────────────────────────────────────

export const PORTRAIT = {
  gen: [1024, 1536], // генерация, 2:3
  master: [2048, 3072], // мастер после апскейла ×2 и дописки
  export: [1024, 1536], // public/portraits/<id>/<slot>.webp, альфа
};
export const BACKGROUND = {
  master: [2560, 1440],
  export: [1920, 1080], // public/backgrounds/<id>.webp
};
export const TITLE = { master: [3840, 2160], export: [2560, 1440] }; // + .avif
export const REF_SHEET = [2304, 1536]; // 3:2, рабочий файл, в игру не идёт

// ─── Универсальные блоки ────────────────────────────────────────────────────

export const STYLE_PORTRAIT =
  "Painterly graphic-novel oil painting on canvas: loose expressive brushwork with visible strokes and palette-knife scrapes, raw canvas in the darkest areas, slightly exaggerated characterful features, psychological realism, limited palette of polar-night blue-black #0B1020, sodium amber #FFB547, muted aurora teal #2EE6C5 and steam white #F2F5F7 over cool greys, fine grain baked into the paint, matte surface";

const TURN_DEFAULT = "body and face turned three-quarters toward the right of the frame";

export const framingPortrait = (turn = TURN_DEFAULT) =>
  `Chest-up bust portrait, vertical 2:3, one person centered, ${turn}, eyes to the viewer unless stated otherwise, eye line at one third of the height, top of the head one tenth below the top edge, chest cut by the bottom edge, hands kept above the lower third. Split lighting identical in every image: cold teal rim light from the left and behind, warm sodium-amber key light from the right on the face, shadows into deep blue-black. Flat solid dark navy background #1A2442, no texture, no gradient, nothing behind the figure`;

export const FRAMING_ID_PHOTO =
  "Frontal head-and-shoulders portrait like an official personnel-file photo, vertical 2:3: shoulders square, face straight to the camera, eyes into the lens, eye line at one third of the height, top of the head one tenth below the top edge. The same split lighting, softer and lower in contrast: cold teal rim light from the left, warm amber key light from the right. Flat solid dark navy background #1A2442, nothing behind the figure";

export const OUTDOOR =
  "Outdoors at minus forty: white rime frost on the eyelashes, eyebrows and collar, ice crystals in the hair, a faint wisp of breath vapor at the mouth, cheeks and nose reddened by the cold, same lighting and same flat background";

export const NEGATIVE_PORTRAIT =
  "photograph, photorealistic, 3D render, CGI, octane render, unreal engine, glossy plastic skin, airbrushed skin, smooth digital painting, anime, manga, cartoon, cel shading, chibi, vector art, comic halftone, text, letters, numbers, captions, signature, watermark, logo, brand name, readable label, frame, border, vignette, extra fingers, six fingers, fused fingers, deformed hands, extra arms, extra limbs, second person, duplicate figure, distorted face, asymmetric eyes, cross-eyed, lens flare, bokeh, neon glow, purple shadows, violet tint, magenta cast, oversaturated, HDR, gradient background, patterned background, scenery, objects in the background, celebrity likeness, resemblance to a real person";

/** Короткий --no для Midjourney: длинные списки там ухудшают картинку */
export const MJ_NO = "--no text, letters, watermark, logo, frame, 3d, anime, photo, glossy skin, purple";

export const STYLE_BACKGROUND =
  "Painterly graphic-novel environment painting in oil on canvas: loose visible brush strokes, simplified massed shapes, limited palette of polar-night blue-black #0B1020, sodium-amber #FFB547 lamps, muted aurora-teal #2EE6C5 cold light and steam white #F2F5F7 over desaturated greys, haze and fine grain baked into the paint, matte, cinematic wide shot at eye level, 16:9";

export const COMPOSITION_BACKGROUND =
  "Dialogue-screen composition: a calm low-contrast center-right for text, the key light and focal detail in the right third or the upper half, the central third reads as the place by itself, nothing important in the bottom tenth";

export const NEGATIVE_BACKGROUND =
  "people, figures, faces, crowd, text, letters, numbers, signage with words, logos, brand names, watermark, signature, frame, border, 3D render, CGI, photorealistic photograph, glossy, anime, cartoon, vector, tilt-shift, fisheye, lens flare, bokeh, neon glow, purple shadows, oversaturated, HDR";

export const REF_SHEET_BLOCK =
  "Character reference turnaround sheet: the same person shown three times side by side on one wide canvas, front view, three-quarter view and profile view, head and upper chest, neutral expression, even soft neutral studio light, plain mid-grey background #6E7378, identical proportions and identical clothes in all three views, painterly oil technique with visible brush strokes, no text, no labels, no numbers";

// ─── Каст: внешность и слоты (GAME_DESIGN §2, §11.1) ─────────────────────────
// tier: P0 — первые 15 (пролог и акт I, якоря), P1 — остальное для акта I, P2 — акт II, P3 — акт III и эпилог.
// rank — место в топ-15 (только P0).

export const CAST = [
  {
    id: "ratnikov",
    name: "Лев Борисович Ратников",
    age: 58,
    accent: "#FFB547",
    ru: {
      body: "58 лет. Высокий, сутулый, большие руки.",
      face: "Длинное лицо с глубокими носогубными складками, тяжёлые брови, глубоко посаженные усталые добрые глаза, седая щетина.",
      hair: "Седой ёжик.",
      clothes: "Толстый серый кардиган поверх голубовато-серой форменной рубашки, тёмный галстук ослаблен. Погоны и нашивки скрыты кардиганом: никаких шевронов с текстом.",
      props: "Очки для чтения на чёрном шнурке; стакан чая в подстаканнике с рельефом ледокола (без надписей).",
      signature: "Пластиковая трубочка нитроглицерина с белой крышкой торчит из нагрудного кармана рубашки — на всех вариантах.",
      accent: "`#FFB547` натриевый янтарь: тёплый рефлекс на лице, стакане и подстаканнике.",
      qa: "Трубочка в кармане; очки на шнурке; руки крупные. `lie` — та же поза, кадр и свет, что `neutral`: вспышка 300 мс не должна «прыгать».",
    },
    en: "Lev Ratnikov, a 58-year-old Russian police lieutenant colonel, tall and stooped, very large hands, grey crew-cut hair, heavy bushy grey eyebrows, deep-set tired kind eyes, a long lined face with heavy nasolabial folds, grey stubble, reading glasses on a black cord around his neck, a thick grey knitted cardigan over a pale blue-grey uniform shirt with a loosened dark tie and no visible insignia, a small translucent plastic nitroglycerin tube with a white cap sticking out of the shirt breast pocket, looks permanently cold",
    negative: "insignia patches, medals, beard",
    slots: [
      { slot: "neutral", tier: "P0", rank: 1, ru: "Якорь. Тёплый, ироничный, смертельно уставший; смотрит поверх очков; двумя руками держит стакан в подстаканнике с ледоколом.", en: "Expression: calm, warm and weary, a faint ironic smile at one corner of the mouth, heavy brows relaxed, eyes looking at the viewer over the reading glasses lowered on his nose; both big hands hold a tea glass in a metal glass-holder embossed with an icebreaker ship at chest height, a thin curl of steam from the tea" },
      { slot: "happy", tier: "P1", ru: "Искренний тёплый смех («Ну-с, медь. Классика»): глаза в морщинках, стакан чуть приподнят, как для тоста.", en: "Expression: a genuine warm laugh, eyes narrowed into crow's feet, mouth open in a chuckle, head tilted slightly back, the tea glass in its icebreaker holder lifted a little as if in a toast, reading glasses hanging on the cord" },
      { slot: "tired", tier: "P1", ru: "Предельная усталость: очки подняты на лоб, большим и указательным сжимает переносицу, плечи провалились в кардиган.", en: "Expression: utterly exhausted, heavy eyelids, grey bags under the eyes, the reading glasses pushed up onto his forehead, thumb and forefinger of one big hand pinching the bridge of his nose, shoulders sunk into the cardigan, mouth slack" },
      { slot: "uneasy", tier: "P1", ru: "Отводит взгляд вниз-влево, улыбка не доходит до глаз, пальцы крутят шнурок очков.", en: "Expression: avoiding the viewer, gaze sliding down and to the left, brows knitted, jaw working, a forced half-smile that does not reach the eyes, fingers of one hand twisting the cord of his reading glasses" },
      { slot: "lie", tier: "P1", ru: "Ложь: казённая маска. Почти `neutral`, но подбородок выше, вежливая канцелярская полуулыбка, взгляд мимо плеча зрителя, руки сложены слишком аккуратно.", en: "Expression: a composed official mask, nearly identical to his calm look but wrong: chin slightly raised, a polite bureaucratic half-smile, eyes fixed a few centimeters past the viewer's shoulder, eyebrows perfectly still, big hands folded too neatly at the chest, a held breath" },
      { slot: "ashamed", tier: "P2", ru: "Стыд: голова опущена, ладонь закрывает рот и подбородок, уши покраснели.", en: "Expression: shame, head lowered, eyes cast down and away, brows raised in the middle, one big hand covering his mouth and chin, shoulders hunched inside the cardigan, ears reddened" },
      { slot: "broken", tier: "P2", ru: "Исповедь (Д7): очки сняты и висят в безвольной руке, мокрые покрасневшие глаза смотрят в никуда, слеза на щетине.", en: "Expression: broken, posture collapsed, reading glasses taken off and hanging from his limp hand at chest level, wet red-rimmed eyes staring into nothing, mouth slightly open, a single tear on the stubbled cheek, face grey and suddenly older" },
      { slot: "hurt", tier: "P2", ru: "Боль в груди (инфаркт, Д7): кулак прижат к грудине, лицо серое и мокрое, зубы стиснуты; трубочка нитроглицерина на виду.", en: "Expression: sudden crushing chest pain, a fist pressed hard against the sternum over the cardigan, face ashen and sweaty, teeth clenched, eyes squeezed half shut, breathing through the mouth, body bent slightly forward, the nitroglycerin tube visible in the shirt pocket" },
    ],
  },
  {
    id: "dasha",
    name: "Дарья Сергеевна Ким",
    age: 25,
    accent: "#FF6A2B",
    turn: "body three-quarters toward the right of the frame, face turned only about twenty degrees so the shaved left temple shows on the right side of her head in the warm light",
    ru: {
      body: "25 лет. Невысокая, жилистая, быстрая.",
      face: "Корейские черты (корё-сарам, по фамилии отца; подтвердить у владельца), острые тёмные глаза, без макияжа, тонкий белый шрам на подбородке.",
      hair: "Тугая тёмная коса, левый висок выбрит. Голова повёрнута слабо (≈20°), чтобы выбритый висок читался справа в тёплом свете.",
      clothes: "Ярко-оранжевая экспедиционная парка `#FF6A2B` со светоотражающими полосами и капюшоном с искусственным мехом, чёрные перчатки без пальцев.",
      props: "Гарнитура с витым проводом в правом ухе, небольшая бодикамера на груди (без логотипа), жвачка.",
      signature: "Шрам на подбородке (крючок, детство) + выбритый левый висок + сбитые костяшки.",
      accent: "`#FF6A2B` — сама парка; единственное насыщенное пятно в её кадре.",
      qa: "Шрам — на всех 9 файлах; висок виден; камера и парка без логотипов. Архетип «чёрное каре и красная помада» запрещён.",
    },
    en: "Dasha Kim, a 25-year-old Russian police operative of Koryo-saram (Russian-Korean) heritage, short and wiry, sharp dark eyes, no makeup, a thin white scar on the chin, dark hair pulled into one tight braid with the left temple shaved short, a bright signal-orange expedition parka (#FF6A2B) with silver reflective stripes and a faux-fur hood ruff, a radio earpiece with a coiled wire in her right ear, a small body camera clipped to her chest, black fingerless gloves, scuffed knuckles, chewing gum, restless quick energy",
    negative: "black bob haircut, red lipstick, heavy makeup, long loose hair, logo on the parka",
    slots: [
      { slot: "neutral", tier: "P0", rank: 4, ru: "Якорь. Собранная, резкая, не впечатлена; бровь чуть вверх, жуёт жвачку, пальцем придерживает гарнитуру — слушает рацию.", en: "Expression: alert, sharp and unimpressed, one eyebrow slightly raised, jaw shifted mid-chew of gum, direct gaze at the viewer; one gloved hand touching the earpiece as if listening to the radio" },
      { slot: "neutral_outdoor", tier: "P0", rank: 7, ru: "Уличный вариант `neutral` (Д1, дорога на подстанцию): иней на ресницах, бровях и меху капюшона, пар изо рта, красные щёки.", en: "Expression: alert, sharp and unimpressed, one eyebrow slightly raised, jaw shifted mid-chew of gum, direct gaze at the viewer; one gloved hand touching the earpiece as if listening to the radio; hood down, the faux-fur ruff of the parka rimed with frost, breath slightly ragged in the cold" },
      { slot: "smug", tier: "P1", ru: "Кривая ухмылка уголком рта, подбородок вверх, руки скрещены, видны сбитые костяшки.", en: "Expression: a crooked grin with one corner of the mouth up, chin tilted up, eyes narrowed with amusement, gum between her teeth, arms crossed over the orange parka, scuffed knuckles showing" },
      { slot: "angry", tier: "P1", ru: "Ярость на коротком поводке: челюсть сжата, ноздри раздуты, кулак со сбитыми костяшками на уровне груди.", en: "Expression: fury held on a short leash, jaw clenched, nostrils flared, brows drawn down hard, eyes narrowed, leaning toward the viewer, one fist raised at chest height with scuffed knuckles" },
      { slot: "scared", tier: "P2", ru: "Страх, который она плохо прячет: глаза широко, дыхание задержано, рука застыла на гарнитуре, другая сжимает молнию.", en: "Expression: fear she hides badly, eyes wide, lips parted, breath held, shoulders raised, one hand frozen on the earpiece, the other gripping the parka zipper" },
      { slot: "determined", tier: "P1", ru: "Решимость: тяжёлый прямой взгляд, губы в линию, застёгивает парку до подбородка — готова идти.", en: "Expression: steady hard gaze straight into the viewer, lips pressed into a line, chin lowered, brows set, one hand pulling the parka zipper up to the chin, ready to move" },
      { slot: "determined_outdoor", tier: "P2", ru: "Уличный вариант `determined` (Створ, мостки, финал): иней, пар, мех капюшона в инее.", en: "Expression: steady hard gaze straight into the viewer, lips pressed into a line, chin lowered, brows set, one hand pulling the parka zipper up to the chin, ready to move; hood down, the faux-fur ruff rimed with frost" },
      { slot: "hurt", tier: "P2", ru: "Боль, которую не показывает: слёзы стоят и не падают, подбородок дрожит так, что белеет шрам; руками держится за края парки.", en: "Expression: pain she refuses to show, eyes glassy with tears that do not fall, lower lip pressed tight, chin trembling so the thin white scar stands out, gaze turned slightly aside, both hands gripping the edges of the open parka" },
      { slot: "broken", tier: "P3", ru: "Детское горе во взрослом лице (Д10, читает свои слова 2015 года): слёзы текут, беззвучное рыдание, гарнитура выдернута и висит на проводе.", en: "Expression: a child's grief in an adult face, eyes red and wide open, tears running freely, mouth open in a silent sob, shoulders shaking, the earpiece pulled out and hanging on its coiled wire" },
    ],
  },
  {
    id: "nina",
    name: "Нина Фёдоровна Шустова",
    age: 67,
    accent: "#D9A441",
    ru: {
      body: "67 лет. Маленькая, круглая.",
      face: "Мягкое морщинистое лицо; толстые очки, увеличивающие глаза, — это её «лицо».",
      hair: "Седой тугой пучок, в нём торчит жёлтый карандаш — на всех 7 вариантах.",
      clothes: "Горчичная вязаная жилетка `#D9A441` поверх кремовой блузки, серые митенки, маленькая брошь.",
      props: "Сушка (`happy`); круглая синяя жестяная коробка из-под печенья без надписей (`ashamed`).",
      signature: "Карандаш в пучке + увеличенные линзами глаза.",
      accent: "`#D9A441` — жилетка.",
      qa: "Карандаш на месте во всех файлах; на коробке нет бренда и текста; линзы увеличивают глаза одинаково.",
    },
    en: "Nina Shustova, a 67-year-old police archivist and former typist, small and round, a soft wrinkled face, very thick glasses that magnify her eyes, grey hair in a tight bun with a yellow pencil stuck through it, a mustard knitted vest (#D9A441) over a cream blouse, grey knitted fingerless mittens, a small old brooch, sharp motherly wit",
    negative: "loose hair, hair down, thin glasses, no glasses",
    slots: [
      { slot: "neutral", tier: "P0", rank: 3, ru: "Якорь. Добрая, но острая; глаза огромные за линзами, знающая полуулыбка, руки в митенках сложены на животе.", en: "Expression: kind but sharp, eyes huge behind the thick lenses, lips pursed in a small knowing smile, head tilted slightly, hands in fingerless mittens folded on her stomach, the pencil stuck in her grey bun" },
      { slot: "happy", tier: "P1", ru: "Сияющая материнская улыбка, протягивает зрителю сушку.", en: "Expression: a beaming motherly smile, round cheeks lifted, eyes crinkled behind the glasses, holding out a ring-shaped dry bagel (sushka) toward the viewer in a mittened hand, the pencil stuck in her bun" },
      { slot: "sad", tier: "P2", ru: "Тихая печаль: очки сползли, мокрые глаза вниз, ладонь в митенке прижата к груди.", en: "Expression: quiet sorrow, glasses slipped down her nose, wet downcast eyes, mouth corners down, one mittened hand pressed flat to her chest, the pencil stuck in her bun" },
      { slot: "scared", tier: "P2", ru: "Страх перед «теми, наверху»: взгляд вверх и в сторону, на потолок; обеими руками стягивает жилетку.", en: "Expression: fear of the people upstairs, eyes enormous behind the lenses glancing up and aside toward the ceiling, shoulders raised, both mittened hands clutching her vest closed, the pencil stuck in her bun" },
      { slot: "thinking", tier: "P1", ru: "Вспоминает номер дела: глаза вверх-вбок, губы шевелятся, палец в митенке поднят у щеки.", en: "Expression: recalling a file number, eyes turned up and to the side, lips moving silently, one mittened forefinger raised beside her cheek, the pencil stuck in her bun" },
      { slot: "angry", tier: "P2", ru: "Ярость старой машинистки: губы побелели, подбородок вверх, очки бликуют, палец наставлен, как у строгой учительницы.", en: "Expression: the tight-lipped fury of an old typist, lips pressed white, chin up, glasses glinting, a mittened forefinger pointed at the viewer like a strict teacher, the pencil stuck in her bun" },
      { slot: "ashamed", tier: "P2", ru: "Старая вина (Д5 «Девочка говорила. Я печатала»): голова опущена, щёки горят, прижимает к груди жестяную коробку из-под печенья.", en: "Expression: shame and old guilt, head bowed, eyes lowered behind the glasses, cheeks flushed, mouth trembling, both mittened hands holding a round blue tin cookie box to her chest, the pencil stuck in her bun" },
    ],
  },
  {
    id: "tokha",
    name: "Антон Сергеевич «Тоха» Лыков",
    age: 24,
    accent: "#7CFF6B",
    ru: {
      body: "24 года. Очень длинный и тощий.",
      face: "Вытянутое бледное лицо, редкая щетина, добрые карие глаза с тёмными кругами.",
      hair: "Тёмный низкий хвост, выбившиеся пряди.",
      clothes: "Чёрное худи с подогревом и тонкой зелёной светодиодной полосой по швам `#7CFF6B`; большие накладные наушники на шее.",
      props: "Смартфон с уведомлением букмекера (`neutral`); банка энергетика без этикетки.",
      signature: "Дешёвое тонкое серебряное кольцо на правом указательном пальце — улика эпилога (неопознанный мужчина в морге с серебряным кольцом). Обгрызенные ногти.",
      accent: "`#7CFF6B` — светодиоды по швам; тонкие линии, не подсветка на пол-кадра.",
      qa: "Кольцо на том же пальце во всех файлах; на экране телефона пиктограмма (мяч, «стрелка вверх»), а не текст; банки без логотипов.",
    },
    en: "Anton 'Tokha' Lykov, a 24-year-old junior sysadmin, very tall and skinny, a long pale face, sparse stubble, kind tired brown eyes with dark circles, dark hair in a low ponytail with loose strands, a black heated hoodie with thin green LED strips glowing along the seams (#7CFF6B), large over-ear headphones around his neck, bitten fingernails, a cheap thin silver ring on his right index finger",
    negative: "short hair, gold jewelry, brand logos, readable phone text",
    slots: [
      { slot: "neutral", tier: "P0", rank: 5, ru: "Якорь. Дружелюбная нервная полуулыбка; в правой руке телефон экраном к зрителю — зелёно-оранжевое уведомление с пиктограммой мяча (букмекер, без текста); в другой банка энергетика.", en: "Expression: a friendly nervous half-grin, kind tired eyes; his right hand with the silver ring on the index finger holds a smartphone at chest height with the screen toward the viewer, a small green-and-orange notification banner with a ball pictogram and an upward arrow on the screen, no readable text; an unlabeled energy-drink can in the other hand" },
      { slot: "happy", tier: "P1", ru: "Широкая дурашливая улыбка, «хе», банка энергетика поднята как тост.", en: "Expression: a big goofy grin with a short laugh, eyes squinting, ponytail swinging, raising an unlabeled energy-drink can like a toast in his right hand with the silver ring on the index finger" },
      { slot: "uneasy", tier: "P1", ru: "Улыбка не держится, глаза бегают, правой рукой (кольцо) трёт затылок.", en: "Expression: an awkward smile that keeps failing, eyes darting aside, his right hand with the silver ring rubbing the back of his neck, shoulders hunched inside the hoodie" },
      { slot: "scared", tier: "P1", ru: "Бледнеет (Д4): пот над губой, грызёт ноготь правой руки, наушники сползают с шеи.", en: "Expression: pale and sweating, eyes wide, chewing a bitten fingernail of his right hand with the silver ring on the index finger, headphones slipping off his neck" },
      { slot: "lie", tier: "P1", ru: "Ложь: слишком широкая угодливая улыбка, глаза не улыбаются, ладони раскрыты «а чё я?», микровзгляд в сторону.", en: "Expression: a too-wide eager grin, eyes not smiling, eyebrows raised in fake innocence, both palms open toward the viewer in a 'who, me?' gesture, silver ring on the right index finger, a tiny glance aside" },
      { slot: "ashamed", tier: "P2", ru: "Стыд (Д8): голова вниз, хвост упал вперёд, капюшон наполовину натянут, руки в кармане худи, светодиоды приглушены.", en: "Expression: shame, head down, ponytail falling forward, hood half pulled up, avoiding the viewer's eyes, hands shoved into the hoodie's front pocket, the LED seams dimmed" },
      { slot: "broken", tier: "P2", ru: "Сломан: пустые глаза, мокрое пятнистое лицо, смотрит на тёмный экран телефона в дрожащей руке с кольцом.", en: "Expression: hollow-eyed, blotchy wet face, mouth open, slumped, staring down at the dark screen of the phone in his trembling right hand with the silver ring on the index finger" },
    ],
  },
  {
    id: "burtsev",
    name: "Валерий Николаевич «Бурый» Бурцев",
    age: 54,
    accent: "#6B4E3D",
    ru: {
      body: "54 года. Широкий, почти без шеи.",
      face: "Обветренное красноватое лицо, маленькие спокойные светлые глаза, щёточка усов.",
      hair: "Ёжик с проседью.",
      clothes: "Поношенная коричневая кожанка `#6B4E3D` поверх тёмного свитера.",
      props: "Деревянная спичка у губ.",
      signature: "**Левая кисть на первом плане на всех 5 вариантах** (§11.2): поднята к лицу, тыльной стороной к зрителю; большой и указательный держат спичку у губ, остальные пальцы свободно вытянуты; **у безымянного нет ногтевой фаланги** — ногтя нет, кончик гладкий, зажившая культя (палец отрубило лебёдкой траулера в 2009). Это улика с Д3: та же рука на косяке Береговой, 4.",
      accent: "`#6B4E3D` — кожанка.",
      qa: "Пересчитать пальцы: пять; безымянный короче ровно на ногтевую фалангу, ногтя нет; рука **левая** (в кадре справа, ближе к тёплому свету); поза кисти одинаковая во всех эмоциях. Paint-over обязателен для каждого файла.",
    },
    en: "Valery Burtsev, a 54-year-old head of a private security company, broad and stocky with almost no neck, a short grey-brown crew cut, a small neat toothbrush mustache, small calm pale eyes, weathered ruddy skin, a worn brown leather jacket (#6B4E3D) over a dark sweater, quiet polite menace; his LEFT hand is raised in the foreground holding a match, back of the hand toward the viewer, thumb and index finger pinching a wooden matchstick at his lips, middle, ring and little fingers loosely extended: the ring finger is missing its fingertip at the nail joint (no nail, healed stump), all other fingers complete with nails",
    negative: "intact left ring fingertip, fingernail on the left ring finger, gloves, cigarette, right hand raised instead of left",
    slots: [
      { slot: "neutral", tier: "P0", rank: 12, ru: "Якорь. Спокойный, вежливый, непроницаемый; маленькие светлые глаза прямо на зрителя; спичка у губ в левой руке.", en: "Expression: calm, polite and unreadable, small pale eyes looking straight at the viewer, mouth relaxed under the neat mustache, the matchstick at his lips held by the raised left hand" },
      { slot: "cold", tier: "P1", ru: "Мёртвый спокойный взгляд, лицо неподвижно, веки чуть опущены, спичка замерла.", en: "Expression: a dead calm stare, face completely still, eyelids slightly lowered, head lowered a few degrees, the matchstick held motionless at his lips by the raised left hand, quiet menace" },
      { slot: "smug", tier: "P1", ru: "Едва заметная односторонняя усмешка под усами, глаза презрительно веселы, спичка отведена от губ.", en: "Expression: the faintest one-sided smile under the mustache, eyes amused and contemptuous, the raised left hand tilting the matchstick away from his lips" },
      { slot: "thinking", tier: "P1", ru: "Считает: глаза сужены и в сторону, кончик спички касается нижней губы.", en: "Expression: calculating, eyes narrowed and looking slightly aside, brow barely furrowed, the tip of the matchstick touching his lower lip, held by the raised left hand" },
      { slot: "scared", tier: "P3", ru: "Впервые теряет контроль (финал): глаза чуть шире, ноздри раздуты, капля пота у виска, спичка сломана пополам в пальцах.", en: "Expression: control slipping for the first time, eyes widened a little, nostrils flared, a bead of sweat at the temple, the matchstick snapped in half between the fingers of the raised left hand" },
    ],
  },
  {
    id: "granin",
    name: "Эдуард Витальевич Гранин",
    age: 59,
    accent: "#8B5CF6",
    ru: {
      body: "59 лет. Грузный, массивный.",
      face: "Тяжёлая челюсть, брыли, тяжёлые веки, толстая шея.",
      hair: "Седина, зачёсанная назад.",
      clothes: "Глянцевый коричневый кожаный пиджак поверх чёрной шёлковой рубашки с расстёгнутым воротом: дорого и безвкусно.",
      props: "Крупные золотые часы без марки; печатка с тёмно-фиолетовым камнем на мизинце.",
      signature: "Печатка + «дедовская» улыбка с билборда «Тепло, которое не кончается» (`happy`).",
      accent: "`#8B5CF6` — только камень печатки. Фиолетовый в тенях запрещён (UI §13).",
      qa: "Никакого сходства с реальными политиками и бизнесменами; на часах нет логотипа; `happy` идёт ещё и на билборд фона `polyarnaya_street_night`.",
    },
    en: "Eduard Granin, a 59-year-old tycoon and mayoral candidate, heavy-set and massive, a big head, a heavy jaw with jowls, heavy eyelids, a thick neck, grey hair combed straight back, fleshy hands, expensive but tasteless clothes: a glossy brown leather blazer over a black silk shirt open at the collar, a heavy gold signet ring with a dark violet stone (#8B5CF6) on his little finger, a large gold wristwatch with no visible brand, theatrical patriarch's charm, an invented face with no resemblance to any real politician",
    negative: "resemblance to a real politician, uniform, tie, glasses",
    slots: [
      { slot: "neutral", tier: "P2", ru: "Якорь. Уверенный патриарх: тяжёлые веки, благодушная полуулыбка, руки сложены на животе — видны печатка и часы.", en: "Expression: a self-assured patriarch, heavy-lidded eyes, a slight benevolent smile, chin up, big fleshy hands clasped over his belly showing the signet ring with the violet stone and the gold wristwatch" },
      { slot: "happy", tier: "P1", ru: "«Тёплый патриарх» с билборда: широкая улыбка с зубами, глаза лучатся, руки полураскрыты, будто обнимает город. Делать раньше остальных его эмоций — нужен для билборда на Полярной (Д3).", en: "Expression: the billboard grandfather, a broad warm smile showing teeth, eyes twinkling, arms half open as if to embrace the whole town, the signet ring with the violet stone visible" },
      { slot: "smug", tier: "P2", ru: "Тяжёлая презрительная улыбка, смотрит сверху вниз, палец постукивает по печатке.", en: "Expression: a heavy contemptuous smile, eyes half closed, head tilted back, looking down his nose at the viewer, a thick finger tapping the signet ring" },
      { slot: "cold", tier: "P3", ru: "Улыбка выключена: плоский тяжёлый взгляд, бульдожья челюсть, чуть подался к зрителю.", en: "Expression: the smile switched off, a flat heavy stare, jaw set like a bulldog, leaning slightly toward the viewer, fists resting together" },
      { slot: "shaken", tier: "P3", ru: "Потрясён: глаза широко, челюсть отвисла, брыли побелели, рука тянет ворот.", en: "Expression: shock, eyes wide, jaw slack, color drained from the jowls, one hand tugging at his open collar, the self-assurance cracked" },
      { slot: "scared", tier: "P3", ru: "Паника большого человека: пот на лбу, глаза бегают, руки подняты в защиту, часы и печатка дрожат.", en: "Expression: panic in a big man, sweat on the forehead, eyes darting, mouth open, both hands raised defensively, the gold watch and the signet ring trembling" },
    ],
  },
  {
    id: "melnik",
    name: "Константин Игоревич Мельник",
    age: 41,
    accent: "#9AA5B1",
    ru: {
      body: "41 год. Подтянутый.",
      face: "Гладко выбрит, холёная кожа, идеальные белые зубы, оценивающий взгляд.",
      hair: "Тёмные зализанные назад волосы.",
      clothes: "Приталенный серо-стальной костюм `#9AA5B1` и узкий галстук — не форма.",
      props: "Очки без оправы, чёрные смарт-часы, белый вкладыш в правом ухе.",
      signature: "Очки без оправы + вкладыш + часы; резкий парфюм не рисуется — его «играет» лоск.",
      accent: "`#9AA5B1` — костюм.",
      qa: "Без логотипов на часах и вкладыше; не злодей, а трус — без зловещих теней в лице.",
    },
    en: "Konstantin Melnik, a 41-year-old police major and IT chief who dresses like a corporate manager, slim, sleek slicked-back dark hair, clean-shaven, rimless glasses, perfect bright white teeth, a fitted slate-grey suit (#9AA5B1) with a narrow tie, a black smartwatch, a white wireless earbud in his right ear, polished KPI confidence with cowardly eyes",
    negative: "police uniform, beard, thick-rimmed glasses, resemblance to a real person",
    slots: [
      { slot: "neutral", tier: "P0", rank: 14, ru: "Якорь. Корпоративная выдержка: тонкая профессиональная улыбка, оценивающий взгляд за стёклами, палец на смарт-часах.", en: "Expression: polished corporate composure, a thin professional smile, evaluating eyes behind the rimless glasses, one finger tapping the black smartwatch" },
      { slot: "smug", tier: "P1", ru: "Снисходительная улыбка с идеальными зубами, брови вверх, поправляет очки пальцем.", en: "Expression: a condescending smile showing perfect white teeth, eyebrows raised, head tilted, adjusting the rimless glasses with one forefinger" },
      { slot: "angry", tier: "P2", ru: "Возмущение с поджатыми губами (Д8, обвиняет игрока): лицо покраснело над тугим воротом, тычет пальцем.", en: "Expression: thin-lipped indignation, nostrils flared, face flushed above the tight collar, jabbing a finger at the viewer" },
      { slot: "scared", tier: "P3", ru: "Трусость: глаза за стёклами широко, капля пота, причёска чуть сбита, ладони вперёд.", en: "Expression: cowardice, eyes wide behind the glasses, a bead of sweat at the temple, the slicked hair slightly disturbed, swallowing hard, palms raised toward the viewer" },
    ],
  },
  {
    id: "alla",
    name: "Алла Дмитриевна Мирошник",
    age: 49,
    accent: "#D94F8A",
    ru: {
      body: "49 лет. Высокая, угловатая.",
      face: "Острые скулы, бледная кожа, насмешливые серые глаза, без помады.",
      hair: "Платиновый ёжик.",
      clothes: "Чёрная водолазка.",
      props: "Много массивных серебряных колец; пожелтевшие от никотина пальцы; электронная сигарета пыльно-розового цвета с розовым диодом; старая зеркалка без марки на потёртом ремне.",
      signature: "Платиновый ёжик + кольца + зеркалка.",
      accent: "`#D94F8A` — корпус и диод электронной сигареты.",
      qa: "Архетип «чёрное каре и красная помада» запрещён; на камере нет логотипа; пар от электронки — тонкий, без облака на пол-кадра.",
    },
    en: "Alla Miroshnik, a 49-year-old journalist and blogger, tall and angular, sharp cheekbones, pale skin, sardonic grey eyes, no lipstick, a platinum-blonde buzz cut, a black turtleneck, many chunky silver rings on her fingers, nicotine-yellowed fingertips, a slim dusty-rose e-cigarette with a tiny pink LED (#D94F8A), an old black DSLR camera with no brand on a worn strap across her chest",
    negative: "black bob haircut, red lipstick, long hair, brand logo on the camera",
    slots: [
      { slot: "neutral", tier: "P2", ru: "Якорь. Язвительная и умная, усталые знающие глаза; электронка у рта в жёлтых пальцах, тонкая струйка пара.", en: "Expression: sardonic and intelligent, tired knowing eyes, the e-cigarette held between two nicotine-yellowed fingers near her mouth, a thin curl of vapor, silver rings on most fingers, the camera strap across her chest" },
      { slot: "smug", tier: "P2", ru: "Острая знающая улыбка, бровь вверх, выдыхает тонкую струю пара в сторону.", en: "Expression: a sharp knowing smile, one eyebrow up, exhaling a thin stream of vapor to the side, the e-cigarette in her ringed fingers" },
      { slot: "tired", tier: "P3", ru: "Выжата: глаза полузакрыты, глубокие складки у рта, трёт висок пальцами в кольцах.", en: "Expression: worn out, eyes half closed, deep lines around the mouth, rubbing her temple with ringed fingers, the e-cigarette dangling unlit" },
      { slot: "ashamed", tier: "P3", ru: "Стыд (Д9, признание): голова опущена, мокрые глаза вниз, обеими руками держит зеркалку на груди, будто прячется за ней.", en: "Expression: shame, platinum head bowed, wet eyes looking down, jaw tight, both ringed hands gripping the old camera on her chest as if hiding behind it" },
    ],
  },
  {
    id: "valentina",
    name: "Валентина Сергеевна Вальц",
    age: 58,
    accent: "#A33A3A",
    ru: {
      body: "58 лет. Худая, очень прямая.",
      face: "Сухое лицо, тонкие губы, спокойные серые глаза — сухая выдержка, за которой ничего не осталось.",
      hair: "Седые волосы убраны назад под платок.",
      clothes: "Тёмно-бордовый шерстяной платок `#A33A3A`, старое тёмное пальто с потёртыми обшлагами.",
      props: "Фото дочери в прозрачном файлике (на фото — Ирина: рыже-каштановая коса, веснушки).",
      signature: "Фото в файлике + потёртые обшлага.",
      accent: "`#A33A3A` — платок.",
      qa: "Лицо на фото — Ирина (дописать по её `happy`); в `hurt_outdoor` иней на платке и ресницах; руки с фото — проверка пальцев.",
    },
    en: "Valentina Valts, a 58-year-old literature teacher and widow, thin and very upright, a gaunt dry face, thin lips, steady grey eyes, grey hair pulled back under a dark burgundy wool headscarf (#A33A3A) worn loosely over the head and shoulders, an old dark coat with frayed cuffs, holding a small color photograph of a young red-haired freckled woman in a clear plastic file sleeve",
    negative: "jewelry, makeup, smiling",
    slots: [
      { slot: "neutral", tier: "P0", rank: 13, ru: "Якорь. Сухая выдержка, очень прямо, ровный взгляд; двумя руками держит фото дочери в файлике у груди, фото к зрителю.", en: "Expression: dry composure, very upright, steady direct eyes, thin lips pressed, both hands holding her daughter's photo in a clear plastic sleeve against her coat at chest height with the photo facing the viewer" },
      { slot: "sad", tier: "P1", ru: "Сухое горе (41-й звонок): смотрит на фото в руках, глаза пустые, платок сползает.", en: "Expression: grief worn dry, looking down at the photo in her hands, eyes empty, mouth corners slightly down, the scarf slipping from her hair" },
      { slot: "hurt", tier: "P2", ru: "Узнаёт часы мужа (Д6): глаза вдруг мокрые, ладонь на губах, другая сминает файлик с фото.", en: "Expression: sudden recognition, eyes wide and suddenly wet, one hand pressed over her mouth, the other gripping the photo sleeve so hard it creases, face drained" },
      { slot: "hurt_outdoor", tier: "P2", ru: "Уличный вариант `hurt` (берег, Д6): иней на ресницах и платке, пар изо рта, ветер тянет платок.", en: "Expression: sudden recognition, eyes wide and suddenly wet, one hand pressed over her mouth, the other gripping the photo sleeve so hard it creases, face drained; wind pulling at the headscarf, frost on the wool" },
      { slot: "determined", tier: "P1", ru: "Взгляд учительницы (Д3 «Её ждали»): подбородок вверх, не моргает, протягивает фото к зрителю, как улику.", en: "Expression: a teacher's unflinching look, chin raised, eyes direct and unblinking, lips pressed, holding the photo in its sleeve out toward the viewer like evidence" },
    ],
  },
  {
    id: "shpala",
    name: "Георгий Ильич «Шпала» Шпаков",
    age: 47,
    accent: "#4C7A3F",
    ru: {
      body: "47 лет. Очень высокий и худой.",
      face: "Впалые щёки, длинный нос, узкие хитрые глаза, плохие зубы.",
      hair: "Под ушанкой.",
      clothes: "Ушанка с подвязанными ушами, чёрный пуховик нараспашку поверх выцветшего зелёного спортивного костюма `#4C7A3F`.",
      props: "—",
      signature: "Наколотые перстни на пальцах (простые геометрические «печатки») — видны на всех 3 вариантах.",
      accent: "`#4C7A3F` — спортивный костюм.",
      qa: "Перстни одинаковые и на тех же пальцах во всех файлах (сверять с `art-src/refs/shpala_hands.png`).",
    },
    en: "Georgy 'Shpala' Shpakov, a 47-year-old scrap-metal dealer and police informant, extremely tall and thin, hollow cheeks, a long nose, sly narrow eyes, bad teeth, a fur ushanka hat with the ear flaps tied up, a shabby black puffer jacket open over a faded green tracksuit (#4C7A3F), long bony fingers with blue-grey tattooed rings on several fingers (simple geometric signet designs)",
    negative: "gloves, untattooed fingers, gold teeth",
    slots: [
      { slot: "neutral", tier: "P0", rank: 9, ru: "Якорь. Хитрый и настороженный, оценивает зрителя; кривая улыбка без зубов; длинные пальцы с перстнями теребят молнию пуховика.", en: "Expression: sly and wary, narrow eyes sizing up the viewer, a crooked closed-mouth grin, the ushanka pushed back, long bony fingers with tattooed rings fiddling with the zipper of the puffer at chest height" },
      { slot: "happy", tier: "P1", ru: "Зубастый хохот (шутка про палец), голова чуть запрокинута, хлопает себя по груди татуированной рукой.", en: "Expression: a toothy cackling laugh, head thrown back a little, eyes squeezed, one long tattooed hand slapping his own chest" },
      { slot: "scared", tier: "P1", ru: "Испуг «не я, начальник»: ушанка надвинута, обе руки подняты, перстни хорошо видны, плечи к ушам.", en: "Expression: fright, eyes wide, the ushanka pulled down, both long hands raised with the tattooed finger rings clearly visible, shoulders up to the ears" },
    ],
  },
  {
    id: "oleg_pakhomov",
    name: "Олег Викторович Пахомов",
    age: 36,
    accent: "#8A8F99",
    ru: {
      body: "36 лет. Одутловатый, рыхлый.",
      face: "Бледное одутловатое лицо, второй подбородок, маленькие бегающие глаза.",
      hair: "Редеющие волосы.",
      clothes: "Выцветшая серая куртка курьера `#8A8F99` с размытой фиолетовой эмблемой без букв («Сияние.Доставка», но без текста).",
      props: "Одноразовый вейп.",
      signature: "Бегающий взгляд + вейп. Мелкое зло крупным планом.",
      accent: "`#8A8F99` — куртка.",
      qa: "Эмблема — абстрактное пятно без букв и без сходства с реальными службами доставки.",
    },
    en: "Oleg Pakhomov, a 36-year-old delivery courier, a puffy pale face, a double chin, small shifty eyes, thinning hair, a faded grey courier jacket (#8A8F99) with a washed-out violet emblem patch that is an abstract shape with no letters, a disposable vape in his hand, petty sulky defensiveness",
    negative: "readable logo, company name, helmet",
    slots: [
      { slot: "neutral", tier: "P0", rank: 11, ru: "Якорь. Надутый и уклончивый: глаза уходят вбок, губы обиженно надуты, вейп у рта.", en: "Expression: sulky and evasive, small eyes sliding sideways, lips pouting, holding a disposable vape near his mouth, slouching inside the zipped courier jacket" },
      { slot: "scared", tier: "P1", ru: "Загнан в угол: пот, глаза бегают, сглатывает, вейп забыт в руке.", en: "Expression: sweaty and cornered, eyes darting, swallowing, the vape forgotten in his hand, shrinking into the jacket collar" },
      { slot: "angry", tier: "P1", ru: "Обиженное возмущение «я вообще-то…»: красные пятна, рот открыт, тычет пальцем себе в грудь.", en: "Expression: offended indignation, a red blotchy face, mouth open mid-protest, chin jutting, pointing a finger at his own chest" },
    ],
  },
  {
    id: "irina",
    name: "Ирина Петровна Вальц",
    age: 29,
    accent: "#7FE3FF",
    ru: {
      body: "29 лет на момент гибели (03.04.1997 – 18.11.2026). Среднего роста, худая.",
      face: "Бледная, много веснушек, светлые серо-зелёные глаза, умное насмешливое лицо.",
      hair: "Толстая рыже-каштановая коса через плечо, выбившиеся пряди.",
      clothes: "Приглушённая оливково-зелёная парка; на фото из личного дела — тёмно-серая водолазка.",
      props: "Большие накладные наушники на шее; маленький старый диктофон («Сверчок») в `happy`.",
      signature: "Веснушки + рыже-каштановая коса + большие наушники.",
      accent: "`#7FE3FF` — холодный блик на наушниках и диктофоне.",
      qa: "Лицо должно совпадать с фото в руках Валентины. Кружка «Лучший аналитик» в кадр не попадает (надпись). Оба файла статичны.",
    },
    en: "Irina Valts, a 29-year-old police data analyst, pale skin with many freckles, light grey-green eyes, a clever wry face, red-chestnut hair in one thick braid over her shoulder with a few loose strands, a muted olive-green parka, large over-ear headphones with a cold cyan glint (#7FE3FF) around her neck",
    negative: "heavy makeup, straight loose hair, blonde hair",
    slots: [
      { slot: "neutral", tier: "P1", framing: "id", character: "Irina Valts, a 29-year-old police data analyst, pale skin with many freckles, light grey-green eyes, a clever wry face, red-chestnut hair in one thick braid over her shoulder with a few loose strands, a plain dark grey turtleneck, no headphones, no parka", ru: "Фото из личного дела, написанное маслом: строго анфас, плечи прямо, нейтральное лицо, взгляд в объектив, тёмно-серая водолазка, без наушников и парки. Свет тот же, но мягче и ниже по контрасту.", en: "Expression: a neutral closed-mouth official look, the faint tension of someone who dislikes being photographed, eyes straight into the lens" },
      { slot: "happy", tier: "P1", ru: "Портрет для заметок (записи диктофона): полуулыбка на коротком выдохе вместо смешка, парка расстёгнута, наушники на шее, старый диктофон у подбородка.", en: "Expression: an amused half-smile caught on a short exhale, eyes bright and crinkled, parka unzipped, the big headphones around her neck, holding a small old silver voice recorder near her chin as if about to record a note" },
    ],
  },
];

/** Рабочие референсы кистей: ключевые приметы, которые модели портят чаще всего */
export const HAND_REFS = [
  {
    id: "burtsev",
    file: "art-src/refs/burtsev_hand.png",
    ru: "Этюд левой кисти Бурцева — эталон для paint-over всех 5 портретов. Утвердить до генерации эмоций.",
    en: "Reference study sheet of one man's LEFT hand shown in three angles side by side: back of the hand toward the viewer, thumb and index finger pinching a wooden matchstick, middle, ring and little fingers loosely extended; the RING FINGER is missing its last joint: no fingernail, a smooth rounded healed stump, clearly shorter than the middle and little fingers; all other fingers complete with nails; weathered ruddy skin of a 54-year-old man, even neutral studio light, plain mid-grey background #6E7378, painterly oil study with visible brush strokes, no text, no labels",
    negative: "intact ring finger, fingernail on the ring finger, six fingers, extra fingers, fused fingers, right hand, gloves, text",
  },
  {
    id: "shpala",
    file: "art-src/refs/shpala_hands.png",
    ru: "Этюд кистей Шпалы с наколотыми перстнями — эталон расположения перстней.",
    en: "Reference study sheet of two long bony male hands shown in three angles side by side, blue-grey prison-style tattooed rings on the fingers: on the right index finger a black square with a white diagonal stripe, on the right ring finger a cross-hatched square, on the left middle finger a dot inside a square, all faded and slightly blurred like old ink, even neutral studio light, plain mid-grey background #6E7378, painterly oil study with visible brush strokes, no text, no letters, no numbers",
    negative: "text, letters, numbers, gloves, colored tattoos, six fingers, fused fingers",
  },
  {
    id: "tokha",
    file: "art-src/refs/tokha_hand.png",
    ru: "Этюд правой кисти Тохи: серебряное кольцо на указательном, обгрызенные ногти, телефон с уведомлением-пиктограммой.",
    en: "Reference study sheet of a young man's thin RIGHT hand shown in three angles side by side, a cheap thin silver band ring on the index finger, short bitten fingernails, in one view holding a smartphone whose screen shows a small green-and-orange notification card with a ball pictogram and an upward arrow and no readable text, even neutral studio light, plain mid-grey background #6E7378, painterly oil study with visible brush strokes, no text, no labels",
    negative: "readable text, letters, numbers, brand logo, gold ring, ring on another finger, six fingers, fused fingers",
  },
];

// ─── Локации (GAME_DESIGN §11.1, §9.1; UI_ART_DIRECTION §7.1, §7.14, §13) ─────
//
// Список локаций — src/data/locations.json: id, подпись, `title` у ключевых картин и запасные
// картины (fallback). Его же читают игра (фоны сцен, проверка Scene.location) и манифест.
// Здесь — только арт по id: волна, место в топ-15, где в игре, промпты. Новая локация —
// строка в JSON и запись здесь; расхождение роняет `npm run manifest`.

const locationRegistry = JSON.parse(readFileSync(join(root, "src", "data", "locations.json"), "utf8"));

const LOCATION_ART = {
  basement_b0_03_evening: {
    tier: "P0",
    rank: 2,
    used: "Пролог (первый вечер), сцены у стола до полуночи",
    ru: "Тесный подвальный кабинет ОЦР: низкий бетонный свод в казённой серо-зелёной краске, две гудящие лампы дневного света, три старых стола, на рабочем месте игрока белая кружка (надписью от зрителя), чугунные батареи под узким окном у потолка — за ним снег и оранжевый натриевый фонарь; чайник парит; стальная дверь с армированным стеклом в коридор серверной.",
    en: "Interior of a cramped basement office of a provincial Russian police analytics unit in the evening: a low concrete vaulted ceiling painted institutional grey-green, two humming fluorescent tubes, three old desks with bulky monitors, a workstation at the center-left with an abandoned white mug beside the keyboard turned so that no print is visible, cast-iron radiators under a narrow window at ceiling level showing falling snow and an orange sodium streetlight outside, cable trays along the ceiling, a grey metal filing cabinet, an electric kettle with a curl of steam, a steel door with a small wired-glass window to the server corridor. Warm tired interior light from the right, cold teal spill from the window and monitors on the left",
  },
  basement_b0_03_night: {
    tier: "P0",
    rank: 15,
    used: "Основной ночной фон: сцены у стола после полуночи во всех делах",
    ru: "Тот же подвал около 02:30: верхний свет выключен, тёплый конус настольной лампы, холодное свечение двух мониторов, косой оранжевый прямоугольник фонаря из окна на стене, крошечные огоньки коммутатора; стул пуст. Композиция и ракурс — как у вечернего варианта.",
    en: "The same cramped basement police office at half past two in the morning, the same camera angle and layout as the evening version: fluorescent tubes switched off, the room lit only by a desk lamp throwing a warm amber cone onto the central desk and by the cold teal-white glow of two monitors, deep blue-black shadows, orange sodium light from the ceiling-level window falling as a slanted rectangle on the wall, snow outside, tiny green status lights of a network switch, the white mug by the keyboard, the chair empty",
  },
  basement_b0_03_day: {
    tier: "P1",
    used: "Дневные сцены у стола: Д4 «Мёртвая душа», утро после Д5, Д9 «Матрёшка», Д10 «Копирка»",
    ru: "Тот же подвал в полдень полярной ночи: горят обе лампы дневного света, в окне у потолка — сизые сумерки без солнца и погасший фонарь, на столах распечатки и папки, мониторы включены, чайник, белая кружка у клавиатуры. Композиция и ракурс — как у вечернего варианта.",
    en: "The same cramped basement police office at midday in the polar night, the same camera angle and layout as the evening version: both fluorescent tubes on, flat cold institutional light, the narrow ceiling-level window showing deep blue-grey twilight with no sun and the sodium streetlight switched off, stacks of printouts and case folders tied with string on the desks, monitors on, the white mug by the keyboard turned so that no print is visible, the electric kettle, cast-iron radiators, a tired working day. Cold teal light from the window and monitors on the left, warmer tube light from the right",
  },
  basement_b0_03_morning: {
    tier: "P2",
    used: "Утренние сцены у стола: Д6 «Полынья» (после выезда на лёд), Д10 «Копирка» (утро 31 декабря)",
    ru: "Тот же подвал около девяти утра: лампы только включили, одна ещё мигает, в окне у потолка — тёмно-синяя ночь, иней на стекле и горящий натриевый фонарь, от чайника пар, на спинке стула куртка с подтаявшим снегом, мониторы просыпаются. Композиция и ракурс — как у вечернего варианта.",
    en: "The same cramped basement police office at nine in the morning, the same camera angle and layout as the evening version: the fluorescent tubes just switched on, one of them still flickering, the narrow ceiling-level window still showing dark blue night with hoarfrost on the glass and an orange sodium streetlight burning outside, the electric kettle steaming, a winter jacket with melting snow thrown over a chair back, monitors waking up, the white mug by the keyboard, a cold room slowly warming. Cold teal from the window on the left, warm light from the right",
  },
  basement_b0_03_morning_tv: {
    tier: "P2",
    used: "Д6 «Полынья», вступление: в коридоре цокольного этажа бубнит телевизор («Полынья замёрзла впервые за 11 лет»)",
    ru: "Утро в том же подвале, ракурс от столов к двери: стальная дверь распахнута в коридор цоколя, там на кронштейне под потолком старый телевизор с новостями — на экране белый лёд залива и бегущая строка (нечитаемо), голубое мерцание экрана на стенах коридора и линолеуме; в кабинете горят лампы, парит чайник, слева на переднем плане угол стола с белой кружкой.",
    en: "The same basement police office in the early morning, the view from the desks toward the door: the steel door with a small wired-glass window stands open onto the basement corridor, where an old television hangs on a wall bracket under the ceiling showing a news broadcast of a white frozen bay with a ticker band of unreadable blur, its pale blue flicker spilling across the corridor walls and the linoleum; inside the office the fluorescent tubes are on and the kettle steams, a desk corner with the white mug in the foreground on the left. Cold blue television light from the corridor, warm tube light in the office",
    notes: "Бегущая строка «Полынья замёрзла впервые за 11 лет» — только ручным набором или вовсе без текста.",
  },
  archive_nina: {
    tier: "P1",
    used: "Сцены с Ниной: пролог, Д5 («Девочка говорила. Я печатала»), Д10 (диск)",
    ru: "Подвальный архив: узкие проходы между высокими металлическими стеллажами с папками на завязках, деревянный картотечный шкаф с латунными ручками, старая электрическая пишущая машинка и стопка копирки, круглая синяя жестяная коробка из-под печенья, тарелка сушек, рыжий кот спит на чугунной батарее, настенные часы, тёплая лампа, пыль в воздухе.",
    en: "A basement police archive: narrow aisles between tall metal shelving packed with cardboard case folders tied with string, a wooden card-catalog cabinet with small brass handles, an old electric typewriter on a desk beside a stack of carbon copies, a round blue tin cookie box with no print and a plate of ring-shaped dry bagels, a ginger cat asleep on a cast-iron radiator, a round wall clock with a plain face, a mustard knitted shawl on the chair back, a warm table lamp on the right, dust floating in the lamplight, cold teal darkness deep in the aisles on the left",
  },
  server_room_b0_11: {
    tier: "P1",
    used: "Сцены с Тохой: Д8 (кода, терминал CRON-01), Д10 (агент на WS-07, импорт диска Нины); пока нет своей картины — и тамбур серверной в финале",
    ru: "Тесная серверная: два ряда чёрных стоек с зелёными и бирюзовыми огоньками, жгуты кабелей, фальшпол; в углу раскладушка со спальником (Тоха ночует), банки энергетика без этикеток, у стены на отдельном столике старый системный блок (WS-07 — тихая подсадка), холодная дымка, конденсат на трубе, одна тёплая лампа.",
    en: "A cramped basement server room: two rows of black server racks with tiny green and teal status LEDs, thick bundles of cables, raised floor tiles, a folding camp bed with a crumpled sleeping bag in the corner, empty unlabeled energy-drink cans, a small desk with a laptop, and by the wall a separate old dusty workstation tower on its own little table, cold air haze, condensation on a ceiling pipe, cold teal light from the racks on the left, one warm amber desk lamp on the right",
  },
  interrogation_glass: {
    tier: "P0",
    rank: 10,
    used: "Допросы «Наушник»: Д1 (Шпала), Д2 (Олег), Д3 (Бурцев), Д11 (Гранин); вставка «за стеклом»",
    people: true,
    ru: "Вид из тёмной комнаты наблюдения сквозь большое одностороннее стекло в маленькую зелёно-серую допросную: привинченный стол, два стула, конусная лампа, батарея, часы без цифр. Даша строго со спины сидит справа (коса, оранжевая парка, провод гарнитуры), стул напротив слева пуст — на его место «садится» портрет подозреваемого. На стекле слабые отражения мониторов наблюдения.",
    en: "View from a dark observation room through a large one-way mirror into a small interrogation room painted institutional grey-green: a bolted metal table, two chairs, a hanging cone lamp, a radiator, a wall clock with a blank face; on the right side of the table a young woman is seen strictly from behind, her face not visible: a tight dark braid, a bright orange expedition parka with reflective stripes, a thin coiled earpiece wire; the chair across the table on the left is empty; faint reflections of the observation room monitors on the glass; the dark edge of the glass and a sill in the foreground. Warm single lamp inside the room, cold teal darkness on the observation side",
    negative: "visible face of the woman, second person, people in the empty chair",
  },
  ratnikov_office: {
    tier: "P1",
    used: "Разговоры с Ратниковым: Д4 «Вы сказали, она уволилась», Д7 «Служебная квартира» (признание)",
    ru: "Кабинет старого подполковника: потёртый советский стол с зелёным сукном, стакан в подстаканнике с ледоколом, стопки дел, полка с потрёпанными книгами, зимняя удочка и ящик для подлёдной рыбалки в углу, серый кардиган на спинке стула, рамка с фото лицом вниз (Тамара), большое окно на площадь Труда — полярная ночь, натриевые фонари, снег; карта побережья без подписей.",
    en: "The office of an old police lieutenant colonel: a worn Soviet-era wooden desk with a green cloth inlay, a glass of tea in a metal glass-holder embossed with an icebreaker, stacks of case files, a shelf of worn paperback books, a winter ice-fishing rod and an ice-fishing box in the corner, a grey knitted cardigan on the back of the chair, a framed photo lying face down on the desk, a wall map of a coastline drawn only as shapes with no lettering, a radiator, a large window onto a snowy square in the polar night with sodium streetlights on the right, warm desk lamp light, cold teal glow from the window glass on the left",
  },
  gu_corridor: {
    tier: "P1",
    used: "Д3 «Наезд на Полярной», финал: Валентина у окна с фотографией дочери",
    ru: "Казённый коридор первого этажа ГУ ночью: стены в две краски, вытертый линолеум с отблесками, ряд закрытых дверей с пустыми табличками, стенд с объявлениями (нечитаемо), деревянная скамья, батарея, половина ламп погашена, в конце — высокое окно на площадь: полярная ночь, снег, натриевые фонари.",
    en: "A long institutional corridor on the ground floor of a regional police headquarters at night: walls painted two-tone, dark green to shoulder height and whitewashed above, scuffed brown linoleum with soft reflections, a row of closed office doors with blank plates, a notice board with pinned papers and no readable text, a wooden bench along the wall, a radiator, half of the ceiling lights switched off, at the far end a tall window onto a snowy square in the polar night with orange sodium streetlights. Cold teal light from the window, warm tired light from the right",
  },
  cardiology_corridor: {
    tier: "P2",
    used: "Д7 (инфаркт Ратникова, тень Бурцева), звонки «из кардиологии» Д8–Д9",
    ru: "Длинный больничный коридор ночью: зелёная плитка до плеча, вытертый линолеум с мокрыми отблесками, ряд пластиковых стульев, дверь палаты с окошком, в котором бирюзово светит кардиомонитор, сестринский пост с тёплой лампой в дальнем конце, мигающая потолочная лампа, пустое кресло-каталка, дальний конец тонет в тени — место для чужой тени.",
    en: "A long hospital cardiology corridor at night: pale green tiles up to shoulder height, scuffed linoleum with wet reflections, a row of plastic chairs, a closed ward door with a small window glowing faint teal from a heart monitor inside, a nurses' station with a warm desk lamp at the far end, one flickering ceiling light, an empty wheelchair against the wall, a tall narrow window with polar night, the far end of the corridor dissolving into deep shadow, tense stillness",
  },
  substation_promzona_2: {
    tier: "P0",
    rank: 8,
    used: "Д1 «Медь» (кража кабеля); уличные сцены Даши",
    ru: "Подстанция в промзоне при −40 ночью: трансформаторы и решётчатые порталы в изморози, изоляторы в инее, сетчатый забор с прорезанной дырой, вскрытая кабельная траншея в снегу, натриевые прожекторы режут ледяной туман, на заднем плане парят градирни дата-центра «Глубины», будка охраны с горящим окном, следы шин.",
    en: "An electrical substation in an Arctic industrial zone at minus forty at night: frost-covered transformers and steel lattice gantries, insulators furred with hoarfrost, a chain-link fence with a cut gap, an opened cable trench in the snow with a severed cable end, sodium floodlights throwing amber cones through ice fog, steam plumes rising from the cooling towers of a huge data center in the background on the right, a guard booth with one lit window, tire tracks in the snow, power lines vanishing into the dark",
  },
  pakhomova_apartment: {
    tier: "P1",
    used: "Д2 «Минус сорок один»",
    ru: "Комната пожилой женщины в пятиэтажке 1960-х после отключения тепла при −41: морозные узоры изнутри стекла, ковёр на стене, сервант с хрусталём, кресло с вязаным пледом, выключенный ламповый телевизор, холодная батарея, градусник на стене, открытая пустая шкатулка на столе, чашка с замёрзшим чаем. Тела нет.",
    en: "The living room of an elderly woman's flat in a 1960s five-storey building after the heating failed at minus forty-one: frost ferns on the inside of the window glass, a patterned carpet hanging on the wall, a polished sideboard with crystal glassware, an armchair with a crocheted blanket, an old tube TV switched off, a cold radiator, a room thermometer on the wall, an open empty jewelry box on the table, a cup of tea frozen solid, breath-cold bluish air, a single warm floor lamp on the right, sodium streetlight glowing through the frosted window, no people, no body",
  },
  polyarnaya_street_night: {
    tier: "P1",
    used: "Д3 «Наезд на Полярной»; уличные сцены Старого города",
    ru: "Улица Старого города ночью: пятиэтажки с выцветшими яркими фасадами (жёлтый, розовый, бирюзовый), натриевые фонари на укатанном снегу, полузанесённый пешеходный переход с тёмными следами торможения, сугробы, снегоуборщик, большой фиолетовый билборд с улыбающимся пожилым мужчиной (Гранин; место под слоган пустое), ледяной туман, слабое бирюзовое сияние.",
    en: "A street in the old town of an Arctic city at night: five-storey Soviet apartment blocks with faded brightly painted facades in yellow, pink and turquoise, sodium streetlights casting amber pools on packed snow, a pedestrian crossing half buried in snow with dark skid marks across it, snowdrifts, a parked snowplow, a large backlit violet billboard on the right showing a smiling heavy-set elderly man with a blank empty band where a slogan will go, ice fog, a polar night sky with a faint teal aurora",
    notes: "Лицо на билборде — Гранин: после генерации вписать его `happy` (inpaint / paint-over). Слоган «Гранин. Тепло, которое не кончается» — только ручным набором или вовсе без текста.",
  },
  polynya_ice_morning: {
    tier: "P2",
    used: "Д6 «Полынья»: Даша выходит на лёд бывшей полыньи с бодикамерой",
    ru: "Залив тёмным утром полярной ночи: бывшая полынья впервые за одиннадцать лет затянута чёрным прозрачным льдом, сквозь него видно дно; следы коньков и санок, вдоль берега — прожекторы и гирлянда стихийного катка, слева старые мостки на сваях, на горизонте парят градирни ЦОДа «Глубина» с нитью натриевых огней.",
    en: "A frozen Arctic bay in the dark morning of the polar night: the former polynya frozen over for the first time in eleven years with clear black ice through which the shallow seabed is faintly visible, skate marks and sled tracks scratched across the ice, temporary floodlights and a string of warm lights along the shore for an improvised skating rink, old wooden walkways on stilts at the left edge, on the far horizon the steaming cooling towers of a huge data center outlined by a thin thread of sodium lights, a deep blue sky with a faint teal glow; cold, wide and quiet",
  },
  black_ice_mostki: {
    tier: "P2",
    used: "Д6 «Полынья» (машина подо льдом); ключевой арт сезона, маркетинг",
    ru: "Ключевой арт сезона: крыша затонувшей легковушки сквозь прозрачный чёрный лёд прямо под поверхностью у старых деревянных мостков на сваях, край парящей полыньи, луч фонаря сверху высвечивает крышу, трещины расходятся от неё, пар над чёрной водой, вдали маяк со слабым лучом, на горизонте натриевые огни ЦОДа, полярная ночь, едва заметное сияние.",
    en: "The season's key art: the roof of a sunken passenger car seen through clear black ice just under the surface, beside old wooden fishing walkways on stilts at the edge of a steaming open-water polynya, the car roof caught by a flashlight beam from above, cracks radiating through the ice around it, steam rising off the black water, a lighthouse in the distance with a weak beam, a thin thread of sodium lights of a data center on the far horizon, polar night sky with a barely visible teal aurora, cold silence; the car roof in the lower center, the walkways leading in from the left, horizon at about sixty percent of the height",
    master: [3840, 2160],
    notes: "Мастер 3840×2160 — ещё и маркетинговый ключевой арт; в игру — 1920×1080.",
  },
  polynya_shore_noon: {
    tier: "P2",
    used: "Д6 «Полынья»: подъём машины из-подо льда, Валентина у ленты",
    ru: "Полдень полярной ночи у Старого причала: синие сумерки, во льду выпилен прямоугольник чёрной воды, над ним треножник с лебёдкой и натянутым тросом, по кромке мокрые обломки льда, сигнальная лента на кольях, машина МЧС с мигалками (без надписей), рабочий прожектор, у причала из льда торчит бетонный оголовок трубы сброса.",
    en: "Midday twilight of the polar night at an old pier on a frozen bay: a rectangle of black open water cut into the ice, a steel tripod with a winch and a taut cable above it, wet broken ice slabs around the edge, red-and-white warning tape on stakes in the snow, an emergency rescue truck with flashing blue and orange lights and no lettering parked on the shore, a work floodlight, the concrete head of a discharge pipe sticking out of the ice beside the old pier, a low deep-blue sky. Cold teal ambient light, warm floodlight accents on the right",
  },
  pier_lantern_night: {
    tier: "P2",
    used: "Д6 «Полынья», финал: разговор с Дашей на мостках («сон»)",
    ru: "Вечер у старых деревянных мостков над бывшей полыньёй: на столбе одинокий фонарь, тёплый круг света на досках, под ним чёрный лёд и свежевырубленная прорубь с тёмной водой, снег на досках, забытая леска, справа вдали маяк со слабым лучом, на горизонте огни ЦОДа. Тихо и пусто.",
    en: "Evening at old wooden fishing walkways on stilts over a frozen polynya: a single lantern on a wooden pole throwing a warm amber circle onto the boards, beneath it black ice and a freshly cut ice hole with dark water, snow on the planks, a forgotten fishing line, the walkways leading in from the left, a distant lighthouse with a weak beam on the right and a thin thread of data center lights on the horizon, a polar night sky, deep blue-black shadows; quiet and intimate",
  },
  cafe_stvor: {
    tier: "P3",
    used: "Д9 (встреча с Аллой, признание)",
    ru: "Маленькое тёплое кафе в старом рыбацком доме у маяка: запотевшие окна, за ними медленно проходит луч маяка и пар полыньи, деревянные столы с клеёнкой, титан для кипятка, сети и старый спасательный круг на стене (без надписей), тёплые подвесные лампы, пустой столик у окна с двумя чашками.",
    en: "A small warm cafe inside an old wooden fishermen's house beside a lighthouse: fogged windows with the slow sweep of the lighthouse beam outside and steam from the polynya beyond, wooden tables with oilcloth covers, a big metal water boiler, fishing nets and an old life ring on the wall with no lettering, a few hanging lamps with warm amber light, an empty table by the window with two cups, snow on the outer windowsill, cold teal night pressing against the glass on the left",
  },
  gu_hall_ceremony: {
    tier: "P3",
    used: "Д9 (церемония Гранина в ГУ)",
    ru: "Парадный холл ГУ полиции перед церемонией: мраморный пол, квадратные колонны, советское абстрактное мозаичное панно (море и сияние, без фигур с текстом), ряды складных стульев, трибуна с пучком микрофонов, штативы телекамер, большие экраны «Сияния» с абстрактной фиолетовой волной (без текста), флаги без символики, смесь холодных прожекторов и тёплой люстры.",
    en: "The grand lobby of a regional police headquarters prepared for a ceremony: a polished marble floor, square columns, a Soviet-era abstract mosaic panel of the sea and the northern lights with no lettering, rows of folding chairs, a lectern with a cluster of microphones, tripods with TV cameras, large corporate screens on stands glowing with an abstract violet wave graphic and no text, plain flags with no symbols, cold floodlights mixing with warm chandelier light, polished reflections on the floor",
    notes: "Фиолетовый здесь — свет экранов «Сияния» (у него есть источник); в тенях фиолетового нет.",
  },
  basement_new_year: {
    tier: "P3",
    used: "Интерлюдия «Черновик» (репетиция в новогоднюю ночь)",
    ru: "Тот же подвал Б0-03 в новогоднюю ночь: крошечная искусственная ёлка с мишурой на картотечном шкафу, гирлянда тёплых огоньков по кабельному лотку, маленький старый телевизор в углу мерцает трансляцией курантов (изображение нечитаемо), мандарины и два стакана чая на столе, в окне у потолка вспышки далёкого салюта.",
    en: "The same cramped basement police office on New Year's Eve, same layout as before: a tiny artificial fir tree with tinsel and a few glass ornaments on top of the filing cabinet, a string of warm fairy lights along the ceiling cable tray, a small old TV in the corner flickering with an unreadable broadcast of a clock tower, tangerines and two glasses of tea on a desk, the ceiling-level window flashing with distant fireworks, warm intimate light and deep shadows, monitors asleep",
  },
  ocr_office: {
    tier: "P3",
    used: "Д11 «Первое солнце»: утро финала у стола, пакет и отправка",
    ru: "Тот же подвал Б0-03 11 января около полудня: верхний свет горит, окно у потолка впервые за сорок дней розовеет рассветными сумерками, иней на стекле подтаивает; на столах архивные коробки с бечёвкой и стопки распечаток, на мониторах таблицы (нечитаемо), белая кружка у клавиатуры. Композиция и ракурс — как у вечернего варианта.",
    en: "The same cramped basement police office on the last day, around noon at the end of the polar night, the same camera angle and layout as the evening version: fluorescent tubes on, the narrow ceiling-level window glowing for the first time with a pale pink and gold dawn twilight, hoarfrost on the glass beginning to melt, cardboard archive boxes tied with string and piles of printouts on the desks, monitors showing tables of unreadable blurred data, the white mug by the keyboard; a tense, expectant morning. The first warm daylight from the window mixing with the cold tube light",
  },
  stairwell_b: {
    tier: "P3",
    used: "Д11 «Первое солнце»: Даша берёт Бурцева на лестнице Б (задача 11.1, исход «лестница»)",
    ru: "Служебная лестница Б вниз, к цокольному этажу: бетонные марши, стальные перила с облупленной краской, стены в две краски, на площадке огнетушитель и батарея, лампа под сеткой, внизу — стальная дверь с армированным стеклом в коридор Б0, на стене трафаретная стрелка без букв.",
    en: "A service stairwell in an old police headquarters leading down to the basement: concrete flights of stairs, steel handrails with chipped paint, walls painted two-tone green and whitewashed, a fire extinguisher and a radiator on the landing, a caged ceiling lamp, at the bottom a steel door with a small wired-glass window into the basement corridor glowing teal, a stenciled arrow on the wall with no letters, deep shadows in the stair well; tense stillness. Warm lamp light from above on the right, cold teal glow from below on the left",
  },
  server_tambour: {
    tier: "P3",
    used: "Д11 «Первое солнце»: Нина держит дверь серверной (задача 11.1, исход «дверь»)",
    ru: "Тесный тамбур перед серверной Б0-11: тяжёлая стальная дверь с кодовым замком и окошком, в котором светятся бирюзовые огоньки стоек, кабельные лотки и трубы под низким потолком, огнетушитель, табурет, резиновый коврик с талым снегом, одна лампа под сеткой.",
    en: "A cramped vestibule in front of a basement server room: a heavy grey steel door with a keypad lock and a small wired-glass window through which tiny teal and green rack lights glow, cable trays and pipes under a low ceiling, a fire extinguisher on the wall, a wooden stool, a rubber mat with melted snow, a single caged lamp; tight and claustrophobic. Cold teal light from the door window on the left, warm lamp light from the right",
  },
  first_sun_window: {
    tier: "P3",
    used: "Д11 «Первое солнце», финал: 12:58, над заливом впервые за сорок дней солнце",
    ru: "Подвал Б0-03 в 12:58: в узком окне под потолком впервые за сорок дней низкое солнце, длинная полоса золотого света ложится через свод на стол и белую кружку, пылинки в луче, иней на стекле горит, лампы дневного света вдруг кажутся бледными. Самая тёплая картина подвала, но всё ещё холодная.",
    en: "The same cramped basement police office at two minutes to one in the afternoon on the first day of sunlight after the polar night: through the narrow ceiling-level window a low sun appears for the first time in forty days and a long band of warm gold light falls across the vaulted ceiling onto the desk and the white mug, dust floating in the beam, hoarfrost on the glass glowing, the fluorescent tubes suddenly looking pale, cold teal shadows deep in the corners on the left; the warmest image of the basement but still cold, quiet and luminous",
  },
  mostki_dawn: {
    tier: "P3",
    used: "Финал (первое солнце 11.01 в 12:58), эпилог: Валентина слушает последнее голосовое",
    ru: "Деревянные мостки на сваях у замёрзшей полыньи в первый рассвет после полярной ночи: солнце — тонкая полоска над морским горизонтом, низкий розово-золотой свет скользит по молодому льду и инею, длинные синие тени, пар становится золотым, справа маяк, позёмка. Самая тёплая картина сезона, но всё ещё холодная.",
    en: "Wooden walkways on stilts at the edge of a frozen-over polynya at the first sunrise after the polar night: the sun just a thin sliver above the sea horizon, low pink-gold light raking across new ice and hoarfrost, long blue shadows, faint steam turning gold, the lighthouse on the right, wind-blown snow drifting over the boards, silent and luminous, the warmest image of the season but still cold; the walkways run from the left into the center",
  },
  title_night: {
    tier: "P0",
    rank: 6,
    used: "Холодное открытие и экран входа (UI §7.1), каждый запуск",
    ru: "По UI §7.1/§13: горизонт на 62 % высоты; ЦОД в правой трети с нитью натриевых огней; полынья — передний план слева, чёрная парящая вода; небо почти чёрное с сине-зелёным; сияние едва различимо (насыщенность ≤ 10 %); левый нижний угол 640×360 спокойный — под текст. Зерно и дымка вшиты.",
    en: "Night panorama of an Arctic town on a bay, horizon line at sixty-two percent of the image height: a huge data center complex with cooling towers in the right third, its outline traced by a thin thread of sodium-amber lights, small dark town blocks along the shore; in the left foreground an open-water polynya with black steaming water, steam drifting to the left; an almost black sky with a deep blue-green cast; the aurora barely visible and very desaturated; the bottom-left corner dark, calm and empty for title text; grain and haze baked into the paint",
    negative: "visible bright aurora, stars, moon, text, letters, logo, people, boats",
  },
  title_dawn: {
    tier: "P3",
    used: "Холодное открытие после финала (GAME_DESIGN §9.1): вместо пара — лёд и солнце",
    ru: "Та же композиция, что `title_night` (делать img2img/правкой от неё, denoise 0,45–0,6): полынья затянута молодым льдом, пара нет, низкое первое солнце над горизонтом, бледное золото на льду, огни ЦОДа ещё горят.",
    en: "The same night panorama composition of the Arctic town on the bay with the same horizon at sixty-two percent of the height and the same data center in the right third, but after the polar night ends: the polynya in the left foreground is frozen over with new dark ice and there is no steam, a low first sun just above the sea horizon spreads pale gold light across the ice, long blue shadows, the sodium lights of the data center still burning faintly, the bottom-left corner calm and empty for title text, grain and haze baked into the paint",
    negative: "steam over water, open water, people, text, letters, logo, boats",
  },
};

/** Локации в порядке locations.json: id, name, title, fallback + арт из LOCATION_ART */
export const LOCATIONS = locationRegistry.locations.map((loc) => {
  const art = LOCATION_ART[loc.id];
  if (!art) throw new Error(`[art] у локации «${loc.id}» из src/data/locations.json нет промпта в LOCATION_ART`);
  return { ...loc, ...art, fallback: locationRegistry.fallback[loc.id] ?? null };
});
for (const id of Object.keys(LOCATION_ART)) {
  if (!LOCATIONS.some((l) => l.id === id)) throw new Error(`[art] LOCATION_ART: локации «${id}» нет в src/data/locations.json`);
}

// ─── Сборка ─────────────────────────────────────────────────────────────────

const variantOf = (slot) => (slot.endsWith("_outdoor") ? "outdoor" : "");
const emotionOf = (slot) => slot.replace(/_outdoor$/, "");
const join2 = (...parts) => parts.filter(Boolean).map((p) => p.replace(/[.\s]+$/, "")).join(". ") + ".";

export function portraitPrompt(ch, s) {
  const framing = s.framing === "id" ? FRAMING_ID_PHOTO : framingPortrait(ch.turn);
  return join2(s.character ?? ch.en, s.en, variantOf(s.slot) ? OUTDOOR : "", framing, STYLE_PORTRAIT);
}
/** Склейка списков негатива без повторов */
const mergeTerms = (...lists) => [...new Set(lists.filter(Boolean).join(", ").split(/,\s*/).filter(Boolean))].join(", ");
export const portraitNegative = (ch) => mergeTerms(NEGATIVE_PORTRAIT, ch.negative);

/** Лист-референс показывает одного человека трижды: «второй человек» и «дубликат» из негатива убираются */
export const refSheetNegative = (ch) =>
  portraitNegative(ch).replace(", second person, duplicate figure", "").replace(", gradient background", "");

export const refSheetPrompt = (ch) => join2(REF_SHEET_BLOCK, ch.en.replace(/; his LEFT hand[\s\S]*$/, ""));

export function backgroundPrompt(loc) {
  return loc.title
    ? join2(loc.en, STYLE_BACKGROUND)
    : join2(loc.en, COMPOSITION_BACKGROUND, STYLE_BACKGROUND, loc.people ? "" : "Empty of people");
}
export function backgroundNegative(loc) {
  const base = loc.people ? NEGATIVE_BACKGROUND.replace("people, figures, faces, crowd, ", "") : NEGATIVE_BACKGROUND;
  return mergeTerms(base, loc.negative);
}

/** Канонические слоты портретов §11.1: [{ character, slot, emotion, variant, tier, rank }] */
export function portraitSlots() {
  return CAST.flatMap((ch) =>
    ch.slots.map((s) => ({
      character: ch.id,
      name: ch.name,
      slot: s.slot,
      emotion: emotionOf(s.slot),
      variant: variantOf(s.slot),
      tier: s.tier,
      rank: s.rank ?? null,
    }))
  );
}

export const backgroundFile = (loc) => `public/backgrounds/${loc.id}.webp`;
const tierLabel = (tier, rank) => (rank ? `${tier}, топ-15 №${rank}` : tier);

/** Строки prompts.csv: file_path, character_or_location, emotion_or_variant, width, height, prompt_en, negative_en, notes_ru */
export function promptRows() {
  const rows = [];
  for (const ch of CAST) {
    rows.push({
      order: [0, 0],
      cells: [`art-src/refs/${ch.id}_sheet.png`, ch.id, "ref_sheet", REF_SHEET[0], REF_SHEET[1], refSheetPrompt(ch), refSheetNegative(ch), "Рабочий лист-референс (анфас, 3/4, профиль, нейтральный свет). Не в игру. Делается до якоря."],
    });
  }
  for (const h of HAND_REFS) {
    rows.push({ order: [0, 1], cells: [h.file, h.id, "hand_ref", REF_SHEET[0], REF_SHEET[1], h.en, h.negative, `Рабочий этюд кисти. Не в игру. ${h.ru}`] });
  }
  const tierN = { P0: 1, P1: 2, P2: 3, P3: 4 };
  for (const ch of CAST) {
    for (const s of ch.slots) {
      const variant = variantOf(s.slot);
      const notes = [
        tierLabel(s.tier, s.rank),
        s.ru,
        variant ? `Вариант \`outdoor\` для эмоции ${emotionOf(s.slot)}: делать правкой от ${emotionOf(s.slot)}.webp того же персонажа.` : "",
        s.framing === "id"
          ? "Особый кадр (фото из личного дела): от него ничего не генерируется."
          : ch.slots.some((x) => x.framing === "id")
            ? `Делать от листа-референса art-src/refs/${ch.id}_sheet.png; лицо сверять с ${ch.id}/neutral.`
            : s.slot === "neutral"
              ? "Якорь: от него генерируются все остальные эмоции."
              : `Делать от якоря ${ch.id}/neutral (референс/правка).`,
        `Генерация ${PORTRAIT.gen.join("×")}, мастер ${PORTRAIT.master.join("×")} с фоном #1A2442, в игру — WebP с альфой.`,
        ch.id === "burtsev" ? "Кисть — paint-over обязателен (этюд art-src/refs/burtsev_hand.png)." : "",
      ].filter(Boolean).join(" ");
      rows.push({
        order: [tierN[s.tier], s.rank ?? 99],
        cells: [`public/portraits/${ch.id}/${s.slot}.webp`, ch.id, s.slot, PORTRAIT.export[0], PORTRAIT.export[1], portraitPrompt(ch, s), portraitNegative(ch), notes],
      });
    }
  }
  for (const loc of LOCATIONS) {
    const [w, h] = loc.title ? TITLE.export : BACKGROUND.export;
    const master = loc.master ?? (loc.title ? TITLE.master : BACKGROUND.master);
    const notes = [
      tierLabel(loc.tier, loc.rank),
      loc.name + ".",
      `Где: ${loc.used}.`,
      `Мастер ${master.join("×")}.`,
      loc.title ? "В игру WebP ≤ 450 КБ и AVIF рядом (UI §13)." : "В игру WebP ≤ 400 КБ; в сцене затемняется слоем --room 55 %.",
      loc.fallback ? `Пока картины нет, сцена показывает ${loc.fallback} (запасная картина, src/data/locations.json).` : "",
      loc.notes ?? "",
    ].filter(Boolean).join(" ");
    rows.push({
      order: [tierN[loc.tier], loc.rank ?? 99],
      cells: [backgroundFile(loc), loc.id, loc.title ? "key_art" : "background", w, h, backgroundPrompt(loc), backgroundNegative(loc), notes],
    });
  }
  // Рабочие референсы — первыми, дальше по волнам и месту в топ-15 (сортировка устойчива)
  return rows.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]).map((r) => r.cells);
}

// ─── Markdown для ART_BIBLE ─────────────────────────────────────────────────

const code = (text) => "```text\n" + text + "\n```\n\n";
const GENERATED = "<!-- Сгенерировано scripts/art-prompts.mjs (npm run manifest). Не правьте руками: правьте данные в скрипте. -->\n\n";

/** Разд. 7: универсальные блоки промпта */
export function renderBlocksMarkdown() {
  let md = GENERATED;
  md += "**STYLE (портреты)** — одинаков для всех 63 портретов:\n\n" + code(STYLE_PORTRAIT);
  md += "**FRAMING/LIGHT (портреты)** — `{turn}` по умолчанию «" + TURN_DEFAULT + "»; у Даши свой поворот (разд. 14.2):\n\n" + code(framingPortrait("{turn}"));
  md += "**FRAMING/LIGHT, фото из личного дела** — только `irina/neutral`:\n\n" + code(FRAMING_ID_PHOTO);
  md += "**OUTDOOR** — добавляется к слотам `<emotion>_outdoor`:\n\n" + code(OUTDOOR);
  md += "**NEGATIVE (портреты)** — для моделей с негативным промптом (SDXL, Flux с CFG, Ideogram, Leonardo); плюс добавка персонажа из разд. 14:\n\n" + code(NEGATIVE_PORTRAIT);
  md += "**Короткий `--no` для Midjourney** (длинный список там вредит):\n\n" + code(MJ_NO);
  md += "**STYLE (фоны)**:\n\n" + code(STYLE_BACKGROUND);
  md += "**COMPOSITION (фоны сцен)** — не добавляется к ключевым картинам холодного открытия:\n\n" + code(COMPOSITION_BACKGROUND);
  md += "**NEGATIVE (фоны)**:\n\n" + code(NEGATIVE_BACKGROUND);
  md += "**REF SHEET** — лист-референс персонажа (перед CHARACTER-блоком):\n\n" + code(REF_SHEET_BLOCK);
  return md;
}

/** Разд. 11.3: сводка по волнам */
export function renderWavesMarkdown() {
  const tiers = [
    ["P0", "Волна P0 — первые 15 (пролог и акт I, якоря и стиль-фреймы)"],
    ["P1", "Волна P1 — остальное для пролога и акта I (П–Д4)"],
    ["P2", "Волна P2 — акт II (Д5–Д8)"],
    ["P3", "Волна P3 — акт III, интерлюдия, финал, эпилог (Д9–Д11)"],
  ];
  let md = GENERATED;
  md += "| Волна | Портретов | Фонов | Всего |\n|---|---:|---:|---:|\n";
  let total = [0, 0];
  for (const [tier] of tiers) {
    const p = CAST.flatMap((c) => c.slots).filter((s) => s.tier === tier).length;
    const b = LOCATIONS.filter((l) => l.tier === tier).length;
    total = [total[0] + p, total[1] + b];
    md += `| ${tier} | ${p} | ${b} | ${p + b} |\n`;
  }
  md += `| **Итого** | **${total[0]}** | **${total[1]}** | **${total[0] + total[1]}** |\n\n`;
  md += `Плюс рабочие файлы, которые в игру не идут: ${CAST.length} листов-референсов и ${HAND_REFS.length} этюда кистей (их делают первыми, до якорей).\n\n`;
  for (const [tier, title] of tiers) {
    const items = [
      ...CAST.flatMap((c) => c.slots.filter((s) => s.tier === tier).map((s) => ({ rank: s.rank ?? 99, label: `\`${c.id}/${s.slot}\`` }))),
      ...LOCATIONS.filter((l) => l.tier === tier).map((l) => ({ rank: l.rank ?? 99, label: `\`${l.id}\` (фон)` })),
    ].sort((a, b) => a.rank - b.rank);
    md += `**${title}:** ${items.map((i) => (i.rank < 99 ? `${i.rank}. ${i.label}` : i.label)).join(tier === "P0" ? "; " : ", ")}.\n\n`;
  }
  return md;
}

/** Разд. 14–15: персонажи и локации с готовыми промптами */
export function renderArtMarkdown() {
  let md = GENERATED;
  md += "## 14. Персонажи: блоки и промпты по слотам\n\n";
  md += "Каждый промпт ниже готов к вставке: CHARACTER → EMOTION → (OUTDOOR) → FRAMING/LIGHT → STYLE. Негатив — общий из разд. 7 плюс добавка персонажа. Для Midjourney добавьте суффикс из разд. 6.2, для правки от якоря — шаблон из разд. 6.5 (в него вставляется только строка `Expression: …`).\n\n";
  md += "МИРА портрета не имеет (разд. 8), Ноль — тоже (GAME_DESIGN §2.0, §9.3).\n\n";
  CAST.forEach((ch, i) => {
    md += `### 14.${i + 1} \`${ch.id}\` — ${ch.name}, ${ch.age}\n\n`;
    md += "| | |\n|---|---|\n";
    md += `| Возраст, сложение | ${ch.ru.body} |\n| Лицо | ${ch.ru.face} |\n| Волосы | ${ch.ru.hair} |\n| Одежда | ${ch.ru.clothes} |\n| Реквизит | ${ch.ru.props} |\n| **Примета** | ${ch.ru.signature} |\n| Акцент палитры | ${ch.ru.accent} |\n| Проверять | ${ch.ru.qa} |\n\n`;
    md += "**CHARACTER-блок:**\n\n" + code(ch.en);
    md += `**Добавка к негативу:** \`${ch.negative}\`\n\n`;
    md += `**Лист-референс** → \`art-src/refs/${ch.id}_sheet.png\`, ${REF_SHEET.join("×")}:\n\n` + code(refSheetPrompt(ch)) + `Негатив листа: \`${refSheetNegative(ch)}\`\n\n`;
    const hand = HAND_REFS.find((h) => h.id === ch.id);
    if (hand) md += `**Этюд кисти** → \`${hand.file}\`, ${REF_SHEET.join("×")}. ${hand.ru}\n\n` + code(hand.en) + `Негатив: \`${hand.negative}\`\n\n`;
    md += `**Слоты (${ch.slots.length}):**\n\n| Слот | Файл | Волна | Что на портрете |\n|---|---|---|---|\n`;
    for (const s of ch.slots) md += `| \`${s.slot}\` | \`public/portraits/${ch.id}/${s.slot}.webp\` | ${tierLabel(s.tier, s.rank)} | ${s.ru} |\n`;
    md += "\n";
    for (const s of ch.slots) {
      md += `#### \`${ch.id}/${s.slot}\` — ${tierLabel(s.tier, s.rank)}\n\n${s.ru}\n\n`;
      md += code(portraitPrompt(ch, s));
    }
  });
  md += "## 15. Фоны и ключевые картины: промпты\n\n";
  md += `Фоны — мастер ${BACKGROUND.master.join("×")}, в игру ${BACKGROUND.export.join("×")} WebP (\`public/backgrounds/<id>.webp\`). Ключевые картины холодного открытия — мастер ${TITLE.master.join("×")}, в игру ${TITLE.export.join("×")} WebP + AVIF. Негатив по умолчанию — NEGATIVE (фоны) из разд. 7; где он другой, он указан под промптом.\n\n`;
  md += "Пока у локации нет своей картины, сцена показывает запасную (столбец «Пока нет — показывается», `src/data/locations.json`): одна сданная картина закрывает все времена суток своей комнаты.\n\n";
  md += "| # | id | Локация | Волна | Где в игре | Пока нет — показывается |\n|---|---|---|---|---|---|\n";
  LOCATIONS.forEach((loc, i) => {
    md += `| ${i + 1} | \`${loc.id}\` | ${loc.name} | ${tierLabel(loc.tier, loc.rank)} | ${loc.used} | ${loc.fallback ? `\`${loc.fallback}\`` : "—"} |\n`;
  });
  md += "\n";
  LOCATIONS.forEach((loc, i) => {
    md += `### 15.${i + 1} \`${loc.id}\` — ${loc.name}\n\n${loc.ru}\n\n`;
    if (loc.notes) md += `> ${loc.notes}\n\n`;
    if (loc.fallback) md += `Пока картины нет, сцена показывает \`${loc.fallback}\`.\n\n`;
    md += code(backgroundPrompt(loc));
    if (loc.negative || loc.people) md += `Негатив для этой картины: \`${backgroundNegative(loc)}\`\n\n`;
  });
  return md;
}

// ─── Запись ─────────────────────────────────────────────────────────────────

const csvCell = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Заменяет содержимое между <!-- name:begin --> и <!-- name:end -->; false, если маркеров нет */
function fillBlock(text, name, content) {
  const begin = `<!-- ${name}:begin -->`;
  const end = `<!-- ${name}:end -->`;
  const a = text.indexOf(begin);
  const b = text.indexOf(end);
  if (a === -1 || b < a) {
    console.warn(`[art] в ART_BIBLE.md нет маркеров ${begin} … ${end} — блок не обновлён`);
    return text;
  }
  return text.slice(0, a + begin.length) + "\n" + content + text.slice(b);
}

/** Пишет prompts.csv и обновляет сгенерированные блоки ART_BIBLE.md. Возвращает число строк CSV. */
export function writeArtOutputs() {
  mkdirSync(outDir, { recursive: true });
  const header = ["file_path", "character_or_location", "emotion_or_variant", "width", "height", "prompt_en", "negative_en", "notes_ru"];
  const rows = promptRows();
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  writeFileSync(join(outDir, "prompts.csv"), "\uFEFF" + csv + "\n");

  const biblePath = join(outDir, "ART_BIBLE.md");
  if (existsSync(biblePath)) {
    const bible = readFileSync(biblePath, "utf8");
    let next = fillBlock(bible, "art-blocks", renderBlocksMarkdown());
    next = fillBlock(next, "art-waves", renderWavesMarkdown());
    next = fillBlock(next, "art-prompts", renderArtMarkdown());
    if (next !== bible) writeFileSync(biblePath, next);
  }
  return rows.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const n = writeArtOutputs();
  const portraits = portraitSlots().length;
  console.log(`[art] prompts.csv: ${n} строк (портретов ${portraits}, фонов ${LOCATIONS.length}); блоки ART_BIBLE обновлены`);
}
