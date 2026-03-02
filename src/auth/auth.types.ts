import { auth } from 'src/lib/auth';

export type UserSession = typeof auth.$Infer.Session;
