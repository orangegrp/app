import { initBotId } from "botid/client/core"
import { initPostHogIfConsented } from "@/lib/analytics"

initBotId({
  protect: [{ path: "/api/*", method: "*" }],
})

initPostHogIfConsented()
