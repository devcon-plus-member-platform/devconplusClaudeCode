import { IsUUID } from 'class-validator';

export class RegisterDto {
  @IsUUID('4')
  eventId!: string;
}
