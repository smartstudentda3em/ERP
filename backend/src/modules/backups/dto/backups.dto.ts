import { IsString, MinLength } from 'class-validator';

export class RestoreBackupDto {
  // Checked against a fixed confirmation code ('0145' — see BackupsService.restoreBackup()),
  // the same convention SystemService.factoryReset() uses for its equally destructive action.
  // Not the caller's real account password — see the comment on that method for why.
  @IsString()
  @MinLength(1)
  confirmationCode: string;
}
