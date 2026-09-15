import { randomBytes } from 'node:crypto';

declare const identifierBrand: unique symbol;
type BrandedIdentifier<Name extends string> = string & {
  readonly [identifierBrand]: Name;
};

export type PostgresUserId = BrandedIdentifier<'PostgresUserId'>;
export type PostgresOrganizationId = BrandedIdentifier<'PostgresOrganizationId'>;
export type PostgresBranchId = BrandedIdentifier<'PostgresBranchId'>;
export type PostgresMembershipId = BrandedIdentifier<'PostgresMembershipId'>;

export type LegacyMongoUserId = BrandedIdentifier<'LegacyMongoUserId'>;
export type LegacyMongoOrganizationId = BrandedIdentifier<'LegacyMongoOrganizationId'>;
export type LegacyMongoBranchId = BrandedIdentifier<'LegacyMongoBranchId'>;
export type LegacyMongoMembershipId = BrandedIdentifier<'LegacyMongoMembershipId'>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyMongoIdPattern = /^[0-9a-f]{24}$/;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value);

export const isLegacyMongoId = (value: unknown): value is string =>
  typeof value === 'string' && legacyMongoIdPattern.test(value);

const requireUuid = <T extends string>(value: string, label: string): T => {
  if (!isUuid(value)) throw new TypeError(`${label} must be a UUID`);
  return value as T;
};

const requireLegacyMongoId = <T extends string>(value: string, label: string): T => {
  if (!isLegacyMongoId(value)) {
    throw new TypeError(`${label} must be a 24-character lowercase hexadecimal identifier`);
  }
  return value as T;
};

export const asPostgresUserId = (value: string): PostgresUserId =>
  requireUuid<PostgresUserId>(value, 'PostgreSQL user ID');
export const asPostgresOrganizationId = (value: string): PostgresOrganizationId =>
  requireUuid<PostgresOrganizationId>(value, 'PostgreSQL organization ID');
export const asPostgresBranchId = (value: string): PostgresBranchId =>
  requireUuid<PostgresBranchId>(value, 'PostgreSQL branch ID');
export const asPostgresMembershipId = (value: string): PostgresMembershipId =>
  requireUuid<PostgresMembershipId>(value, 'PostgreSQL membership ID');

export const asLegacyMongoUserId = (value: string): LegacyMongoUserId =>
  requireLegacyMongoId<LegacyMongoUserId>(value, 'Legacy Mongo user ID');
export const asLegacyMongoOrganizationId = (value: string): LegacyMongoOrganizationId =>
  requireLegacyMongoId<LegacyMongoOrganizationId>(value, 'Legacy Mongo organization ID');
export const asLegacyMongoBranchId = (value: string): LegacyMongoBranchId =>
  requireLegacyMongoId<LegacyMongoBranchId>(value, 'Legacy Mongo branch ID');
export const asLegacyMongoMembershipId = (value: string): LegacyMongoMembershipId =>
  requireLegacyMongoId<LegacyMongoMembershipId>(value, 'Legacy Mongo membership ID');

export const generateLegacyMongoId = (): string => randomBytes(12).toString('hex');

export const generateLegacyMongoUserId = (): LegacyMongoUserId =>
  asLegacyMongoUserId(generateLegacyMongoId());
export const generateLegacyMongoOrganizationId = (): LegacyMongoOrganizationId =>
  asLegacyMongoOrganizationId(generateLegacyMongoId());
export const generateLegacyMongoBranchId = (): LegacyMongoBranchId =>
  asLegacyMongoBranchId(generateLegacyMongoId());
export const generateLegacyMongoMembershipId = (): LegacyMongoMembershipId =>
  asLegacyMongoMembershipId(generateLegacyMongoId());
