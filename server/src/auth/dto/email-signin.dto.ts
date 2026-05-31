import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class EmailSigninDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password!: string;
}
