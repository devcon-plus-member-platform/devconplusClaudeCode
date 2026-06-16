import { IsEmail, IsString, MinLength } from 'class-validator';

export class SendOfficerInviteDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  chapterName!: string;
}
