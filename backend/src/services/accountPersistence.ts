import bcrypt from 'bcryptjs';
import { AppError } from '../utils/AppError.js';

export interface RegisterAdminInput {
  orgName: string;
  orgType: string;
  userName: string;
  phone: string;
  password: string;
}

export interface RegistrationPersistenceInput extends Omit<RegisterAdminInput, 'password'> {
  passwordHash: string;
}

export interface RegistrationResult {
  organization: unknown;
  branch: unknown;
  user: {
    id: unknown;
    tenantId: unknown;
    name?: string;
    phone: string;
    role: string;
  };
}

export interface ThemeInput {
  mode?: 'light' | 'dark';
  primaryColor?: string;
}

export interface AccountRepository {
  registerAdmin(input: RegistrationPersistenceInput): Promise<RegistrationResult>;
  updateTheme(
    organizationId: string,
    data: ThemeInput,
  ): Promise<{ mode: 'light' | 'dark'; primaryColor: string } | null>;
  updateProfileName(userId: string | undefined, name: string): Promise<unknown | null>;
  findPasswordHash(userId: string): Promise<string | null>;
  replacePasswordHashAndRevokeSessions(userId: string, passwordHash: string): Promise<boolean>;
}

export const registerAdmin = async (
  repository: AccountRepository,
  data: RegisterAdminInput,
): Promise<RegistrationResult> => repository.registerAdmin({
  orgName: data.orgName,
  orgType: data.orgType,
  userName: data.userName,
  phone: data.phone.trim(),
  passwordHash: await bcrypt.hash(data.password, 10),
});

export const updateOrganizationTheme = async (
  repository: AccountRepository,
  organizationId: string,
  data: ThemeInput,
): Promise<{ mode: 'light' | 'dark'; primaryColor: string }> => {
  const theme = await repository.updateTheme(organizationId, data);
  if (!theme) throw new AppError('Organization not found', 404);
  return theme;
};

export interface PasswordChangeDependencies {
  repository: Pick<AccountRepository, 'findPasswordHash' | 'replacePasswordHashAndRevokeSessions'>;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  hashPassword: (password: string) => Promise<string>;
}

export const createPasswordChange = ({
  repository,
  verifyPassword,
  hashPassword,
}: PasswordChangeDependencies) => async (
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> => {
  const currentHash = await repository.findPasswordHash(userId);
  if (!currentHash) throw new AppError('User not found or password not set', 404);
  if (!(await verifyPassword(oldPassword, currentHash))) {
    throw new AppError('Invalid old password', 400);
  }
  const updated = await repository.replacePasswordHashAndRevokeSessions(
    userId,
    await hashPassword(newPassword),
  );
  if (!updated) throw new AppError('User not found or password not set', 404);
};
