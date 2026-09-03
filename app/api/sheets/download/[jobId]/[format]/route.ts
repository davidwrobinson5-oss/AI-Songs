import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, safeId, textField } from '../../../../../security';
import { getResult } from '../../../klangio';
import { brandPieSheetPdf } from '../../../piePdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

const EXTENSIONS: Record<string, string> = {
  pdf: 'pdf',
  xml: 'musicxml',
  midi: 'mid',
  midi_quant: 'mid',
  gp5: 'gp5',
  json: 'json',
};

export async function GET(req: Request, context: { params: Promise<{ jobId: string; format: string }> }) {
  const limited = rateLimit(req, 'sheets-download', 30, 60_000);
  if (limited) return limited;

  try {
    const { jobId: rawJobId, format: rawFormat } = await context.params;
    const jobId = safeId(rawJobId, 180);
    const format = textField(rawFormat, 24);
    const extension = EXTENSIONS[format];
    if (!extension) throw new Error('INVALID_RESULT_FORMAT');

    const result = await getResult(jobId, format);
    const bytes = format === 'pdf' ? await brandPieSheetPdf(result.bytes) : result.bytes;
    const contentType = format === 'pdf' ? 'application/pdf' : result.contentType;
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="pie-${jobId.slice(0, 18)}.${extension}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Sheet download failed', error);
    return NextResponse.json(
      { error: safeClientError(error, 'Could not download this sheet-music file.') },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
