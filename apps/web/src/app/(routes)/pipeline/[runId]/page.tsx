import { redirect } from 'next/navigation';

export default async function PipelineRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  redirect(`/applications/${runId}/pipeline`);
}
