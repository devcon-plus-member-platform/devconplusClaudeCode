import { IsEmail } from 'class-validator';

export class EmailResetDto {
  @IsEmail()
  email!: string;
}
