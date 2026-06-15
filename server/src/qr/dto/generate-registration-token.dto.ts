import { IsUUID } from 'class-validator';

export class GenerateRegistrationTokenDto {
  @IsUUID('4')
  registrationId!: string;
}
