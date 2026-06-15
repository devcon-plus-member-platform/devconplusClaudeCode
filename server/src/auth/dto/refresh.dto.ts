import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  // A fresh Firebase ID token (Option A — the token IS the refresh proof).
  // Firebase SDK rotates this silently every hour; client passes the latest.
  @IsNotEmpty()
  @IsString()
  id_token!: string;
}
