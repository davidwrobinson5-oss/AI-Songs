import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const WHITE = rgb(1, 1, 1);
const INK = rgb(0.18, 0.11, 0.09);
const MUTED = rgb(0.46, 0.42, 0.4);
const LINE = rgb(0.9, 0.86, 0.83);
const CRUST = rgb(0.95, 0.61, 0.2);

/**
 * Turn a provider PDF into a user-facing Pie sheet.
 *
 * Klangio documents that its PDF hint/watermark may be removed with a PDF editor.
 * We keep the notation untouched and replace only the footer band, where the
 * provider hint is rendered, with a small Pie-branded footer and our own page count.
 */
export async function brandPieSheetPdf(input: Uint8Array) {
  const pdf = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false });
  const brandFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const metaFont = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  pdf.setCreator('Pie');
  pdf.setProducer('Pie');

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const footerHeight = 29;
    const iconX = 50;
    const iconY = 12.5;

    // Replace only the printable footer margin; do not alter any notation above it.
    page.drawRectangle({ x: 0, y: 0, width, height: footerHeight, color: WHITE });
    page.drawLine({
      start: { x: 24, y: footerHeight - 1 },
      end: { x: width - 24, y: footerHeight - 1 },
      thickness: 0.45,
      color: LINE,
    });

    page.drawText('Pie', {
      x: 28,
      y: 8.2,
      size: 10,
      font: brandFont,
      color: INK,
    });

    // Small vector pie mark so the PDF does not depend on an emoji-capable font.
    page.drawCircle({
      x: iconX,
      y: iconY,
      size: 5.4,
      color: CRUST,
      borderColor: INK,
      borderWidth: 0.65,
    });
    page.drawLine({
      start: { x: iconX, y: iconY },
      end: { x: iconX + 4.3, y: iconY + 3.2 },
      thickness: 0.7,
      color: INK,
    });
    page.drawLine({
      start: { x: iconX, y: iconY },
      end: { x: iconX + 4.7, y: iconY - 2.6 },
      thickness: 0.7,
      color: INK,
    });

    if (pages.length > 1) {
      const label = `${index + 1} / ${pages.length}`;
      const labelWidth = metaFont.widthOfTextAtSize(label, 7.5);
      page.drawText(label, {
        x: width - 28 - labelWidth,
        y: 9.1,
        size: 7.5,
        font: metaFont,
        color: MUTED,
      });
    }
  });

  return pdf.save({ useObjectStreams: true, addDefaultPage: false });
}
