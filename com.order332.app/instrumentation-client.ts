import { initBotId } from "botid/client/core"
import { initPostHogIfConsented } from "@/lib/analytics"

if (process.env.DISABLE_BOT_ID !== "true") {
  initBotId({
    protect: [{ path: "/api/*", method: "*" }],
  })
}

initPostHogIfConsented()
