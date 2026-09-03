import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const WHITE = rgb(1, 1, 1);
const INK = rgb(45 / 255, 28 / 255, 24 / 255);
const MUTED = rgb(0.46, 0.42, 0.4);
const CRUST = rgb(244 / 255, 184 / 255, 95 / 255);
const FILL = rgb(231 / 255, 141 / 255, 69 / 255);
const HIGHLIGHT = rgb(1, 230 / 255, 173 / 255);
const FACE = rgb(108 / 255, 53 / 255, 38 / 255);

/**
 * Turn a provider PDF into a user-facing Pie sheet.
 *
 * The provider watermark occupies a reserved footer area. Clear that complete
 * provider band, then place the Pie identity in the same visual footprint so
 * the result feels like a true brand replacement rather than an added footer.
 * Notation above the provider footer remains untouched.
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
    const providerFooterClearHeight = 108;

    // Remove the full provider footer/watermark region, including both Klangio
    // branding elements, without adding a separate bottom-left Pie footer.
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: providerFooterClearHeight,
      color: WHITE,
    });

    // Center the Pie mark + wordmark in the same footer footprint that was
    // previously occupied by the provider branding.
    const markWidth = 36;
    const markHeight = 42;
    const brandText = 'Pie';
    const brandTextSize = 20;
    const gap = 10;
    const textWidth = brandFont.widthOfTextAtSize(brandText, brandTextSize);
    const brandWidth = markWidth + gap + textWidth;
    const brandX = (width - brandWidth) / 2;
    const markX = brandX;
    const markY = 30;
    const textY = 42.5;

    // Pie body — modeled after the app's actual Pie mark: warm crust, orange
    // filling, dark outline, highlight, eyes, and smile.
    page.drawSvgPath('M 2 5 L 34 5 L 24 35 L 12 35 Z', {
      x: markX,
      y: markY,
      color: FILL,
      borderColor: INK,
      borderWidth: 1.5,
    });

    page.drawEllipse({
      x: markX + markWidth / 2,
      y: markY + markHeight - 4.5,
      xScale: 18,
      yScale: 6.5,
      color: CRUST,
      borderColor: INK,
      borderWidth: 1.5,
    });

    page.drawLine({
      start: { x: markX + 9, y: markY + 31 },
      end: { x: markX + 27, y: markY + 31 },
      thickness: 1.6,
      color: HIGHLIGHT,
      opacity: 0.78,
    });

    page.drawCircle({ x: markX + 13.5, y: markY + 21, size: 1.7, color: FACE });
    page.drawCircle({ x: markX + 22.5, y: markY + 21, size: 1.7, color: FACE });
    page.drawLine({
      start: { x: markX + 13.5, y: markY + 14.5 },
      end: { x: markX + 17.4, y: markY + 12.7 },
      thickness: 1.55,
      color: FACE,
    });
    page.drawLine({
      start: { x: markX + 17.4, y: markY + 12.7 },
      end: { x: markX + 22.5, y: markY + 14.5 },
      thickness: 1.55,
      color: FACE,
    });

    page.drawText(brandText, {
      x: brandX + markWidth + gap,
      y: textY,
      size: brandTextSize,
      font: brandFont,
      color: INK,
    });

    // Keep only the useful page count on multi-page scores; this is not part
    // of the branding and stays visually separate at the lower-right edge.
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
