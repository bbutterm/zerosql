# Кастинг: выбранные образцы голосов

Здесь лежат образцы (Voice Design, eleven_multilingual_ttv_v2), выбранные владельцем, для голосов, которые ещё не созданы в ElevenLabs (`voice_id: "PENDING_SLOT"` в `../tts-voices.json`).

Как создать голос:

1. Основной путь — `POST /v1/text-to-voice` с `generated_voice_id` из `casting.generated_voice_id` (если превью ещё живо).
2. Запасной путь — Instant Voice Clone из файла `<speaker>.mp3` отсюда (`POST /v1/voices/add`).

Затем записать полученный `voice_id` в `tts-voices.json` и запустить `scripts/tts-batch.example.mjs --only <speaker>`.
