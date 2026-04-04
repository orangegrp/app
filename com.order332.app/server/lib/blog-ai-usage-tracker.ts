import 'server-only'
import { supabase } from '@/server/db/supabase/client'

/**
 * Fire-and-forget AI usage log. Never throws — errors are logged to console only
 * so tracking never blocks or delays the AI response.
 */
export function trackAiUsage(userId: string, action: string, inputChars: number): void {
  supabase
    .from('blog_ai_usage')
    .insert({ user_id: userId, action, input_chars: inputChars })
    .then(({ error }) => {
      if (error) console.error('[ai-usage] insert failed:', error.message)
    })
}
