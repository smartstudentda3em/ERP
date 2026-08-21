import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SharedDocumentsService } from './shared-documents.service';

// Generous headroom: the PDFs here are html2canvas screenshots embedded as PNG, not vector text, so
// even a single-page invoice can run several MB — a multi-page or line-item-heavy one more so.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

@ApiTags('Shared Documents')
@Controller('shared-documents')
export class SharedDocumentsController {
  constructor(private readonly service: SharedDocumentsService) {}

  // No @Permissions() gate beyond the global JwtAuthGuard's "must be logged in" — this only ever
  // hosts a PDF the caller already had full, legitimate access to generate/download client-side
  // (an invoice or quotation within their own permission scope); making it reachable by link isn't
  // granting them anything they couldn't already do by attaching the same file manually.
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Only PDF files can be shared this way'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async create(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file uploaded');
    // multer/busboy decode multipart field values (filename included) as Latin1 by default,
    // regardless of what the browser actually sent — a well-known mismatch with the UTF-8 the
    // browser uses for the filename in practice. Left alone, any non-ASCII filename (every PDF
    // here, since buildPdfFileName() always produces Arabic text) comes out as mojibake. This is
    // the standard fix: the bytes are right, they were just decoded under the wrong assumption.
    const originalFilename = Buffer.from(file.originalname || 'document.pdf', 'latin1').toString('utf8');
    const stored = await this.service.save(
      file.buffer,
      originalFilename,
      file.mimetype,
      user.companyId!,
      user.userId,
    );
    return { id: stored.id };
  }

  // Public by design — the recipient (a customer opening a shared link from WhatsApp) has no ERP
  // account. The id is an unguessable uuid; that's the only access control this route has, same
  // trade-off any "shareable link" feature makes.
  //
  // Returns an HTML landing page, not the PDF itself — WhatsApp (and most chat apps) build their
  // link-preview card by fetching the URL and reading its <meta property="og:*"> tags. A URL that
  // resolves straight to raw PDF bytes has none of that to read, which is exactly why the shared
  // link showed up as a bare blue URL with no title or icon instead of looking like a real
  // document. The actual PDF lives one level down, at :id/file.
  @Public()
  @Get(':id')
  async landingPage(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { originalFilename } = await this.service.getFile(id);
    const safeTitle = originalFilename.replace(/[<>&"]/g, '');
    const fileUrl = `${id}/file`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="مستند PDF من نظام إدارة الحسابات">
<style>
  body { font-family: -apple-system, 'Segoe UI', Tahoma, sans-serif; background: #f8fafc; color: #0f172a;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px 24px; max-width: 420px;
          width: 100%; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
  .icon { font-size: 48px; margin-bottom: 8px; }
  h1 { font-size: 17px; font-weight: 700; margin: 0 0 24px; word-break: break-word; }
  a.button { display: inline-block; background: #1e3a8a; color: #fff; text-decoration: none; font-weight: 600;
             padding: 12px 28px; border-radius: 10px; font-size: 15px; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">📄</div>
    <h1>${safeTitle}</h1>
    <a class="button" href="${fileUrl}">فتح المستند</a>
  </div>
</body>
</html>`);
  }

  @Public()
  @Get(':id/file')
  async file(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { filePath, originalFilename, mimeType } = await this.service.getFile(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalFilename)}"`);
    res.sendFile(filePath);
  }
}
