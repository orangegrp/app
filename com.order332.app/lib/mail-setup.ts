import type { User } from "@/server/lib/types"

export function isMailSetupCompletedForUser(user: {
  mailSetupCompletedAt?: Date
}): boolean {
  return Boolean(user.mailSetupCompletedAt)
}
