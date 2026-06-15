import { IsString, Matches, MaxLength } from 'class-validator';

export class RequestUpgradeDto {
  @IsString()
  @MaxLength(20)
  @Matches(/^DCN-[A-Z]{3}-[0-9]{4}$/, { message: 'Code must match DCN-XXX-XXXX format' })
  code!: string;
}
