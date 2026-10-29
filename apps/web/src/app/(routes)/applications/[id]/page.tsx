import { redirect } from 'next/navigation';

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/applications/${id}/overview`);
}
