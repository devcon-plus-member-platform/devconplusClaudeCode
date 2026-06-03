import { IsNotEmpty, IsString } from 'class-validator';

export class ScanQrDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
