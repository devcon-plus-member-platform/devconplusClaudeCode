import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountDto {
  // Fresh Firebase ID token confirming the caller's identity.
  // Required to prove the deletion is intentional and from the account owner.
  @IsNotEmpty()
  @IsString()
  id_token!: string;
}
