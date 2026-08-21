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
    const stored = await this.service.save(
      file.buffer,
      file.originalname || 'document.pdf',
      file.mimetype,
      user.companyId!,
      user.userId,
    );
    return { id: stored.id };
  }

  // Public by design — the recipient (a customer opening a shared link from WhatsApp) has no ERP
  // account. The id is an unguessable uuid; that's the only access control this route has, same
  // trade-off any "shareable link" feature makes.
  @Public()
  @Get(':id')
  async view(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { filePath, originalFilename, mimeType } = await this.service.getFile(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalFilename)}"`);
    res.sendFile(filePath);
  }
}
