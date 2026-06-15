import { IsNotEmpty, IsString } from 'class-validator';

export class FirebaseExchangeDto {
  @IsNotEmpty()
  @IsString()
  id_token!: string;
}
