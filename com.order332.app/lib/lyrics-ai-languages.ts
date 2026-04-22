export type AiLyricsLanguageCode =
  | "auto"
  | "en"
  | "es"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "ja"
  | "ko"
  | "zh"
  | "hi"
  | "ar"
  | "ru"
  | "tr"
  | "nl"
  | "sv"
  | "pl"
  | "vi"
  | "th"

export const AI_LYRICS_LANGUAGE_OPTIONS: Array<{
  value: AiLyricsLanguageCode
  label: string
}> = [
  { value: "en", label: "English" },
  { value: "auto", label: "Auto-detect" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
  { value: "ru", label: "Russian" },
  { value: "tr", label: "Turkish" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "pl", label: "Polish" },
  { value: "vi", label: "Vietnamese" },
  { value: "th", label: "Thai" },
]

export const AI_LYRICS_ALLOWED_LANGUAGE_CODES = new Set(
  AI_LYRICS_LANGUAGE_OPTIONS.map((item) => item.value)
)
