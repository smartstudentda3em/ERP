import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ServiceTierDto {
  /** Free-text capacity label (e.g. "1.5", "2.25") — matches the exact same free-text convention
   * AC's regular products already use for Product.barcode ("القدرة"), so this tier reuses that
   * same column rather than inventing a separate rigid capacity concept. */
  @IsString() capacity: string;
  @IsNumber() @Min(0) price: number;
}

export class CreateServiceDto {
  @IsString() name: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServiceTierDto)
  tiers: ServiceTierDto[];
}

/** Updating tiers replaces the whole set — for each submitted tier, an existing tier row matching
 * the same capacity label is updated in place (keeping its id, so it stays valid on any already-
 * issued invoice); any capacity no longer submitted is removed if never sold, or just deactivated
 * if it is (see ProductsService.updateService). */
export class UpdateServiceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServiceTierDto)
  tiers?: ServiceTierDto[];
}
