import { MailDetailPage } from "@/components/mail/MailDetailPage"

export default async function SentMailMessagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <MailDetailPage messageId={id} />
}
