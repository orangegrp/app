import "server-only"
import DOMPurify from "isomorphic-dompurify"

export function sanitizeMailHtml(input: string | null): string | null {
  if (!input) return null

  const sanitized = DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "base",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "option",
    ],
    FORBID_ATTR: ["srcset"],
  })

  const compact = sanitized.trim()
  return compact.length > 0 ? compact : null
}
