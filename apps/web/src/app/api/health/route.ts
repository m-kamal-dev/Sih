import { type NextRequest } from 'next/server';
import { getDatasetVersion, getLedger, getVerifyResult } from '@/.data/store';
import { apiSuccess } from '@/lib/api-response';
import { aiStatus } from '@/lib/ai-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ledger = getLedger();
  const headHash = ledger.length > 0 ? ledger[ledger.length - 1]!.hash : '0'.repeat(64);
  const verifyResult = getVerifyResult();

  return apiSuccess(
    {
      status: 'ok',
      ai: aiStatus(),
      version: '0.1.0',
      datasetVersion: getDatasetVersion(),
      ledgerHeadHash: headHash,
      chainValid: verifyResult.ok,
      checkedRows: verifyResult.checked,
      brokenAt: verifyResult.brokenAt,
      timestamp: new Date().toISOString(),
    },
    { request },
  );
}
