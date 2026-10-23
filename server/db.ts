import * as pgAuth from './auth-pg.js';
import * as sqliteAuth from './auth-sqlite.js';
import { usingPostgres } from './pg.js';

export type {
  ProcessAssignmentEntry,
  PublicUser,
  User,
  UserRole,
  UserStatus,
} from './auth-sqlite.js';

function postgres(): boolean {
  return usingPostgres();
}

export function initializeAuthDatabase() {
  return postgres() ? pgAuth.initializeAuthDatabase() : Promise.resolve(sqliteAuth.initializeAuthDatabase());
}

export function syncAdminFromEnv() {
  return postgres() ? pgAuth.syncAdminFromEnv() : Promise.resolve(sqliteAuth.syncAdminFromEnv());
}

export function getUserByEmail(email: string) {
  return postgres() ? pgAuth.getUserByEmail(email) : Promise.resolve(sqliteAuth.getUserByEmail(email));
}

export function getUserById(id: number) {
  return postgres() ? pgAuth.getUserById(id) : Promise.resolve(sqliteAuth.getUserById(id));
}

export function getUserByApprovalToken(token: string) {
  return postgres() ? pgAuth.getUserByApprovalToken(token) : Promise.resolve(sqliteAuth.getUserByApprovalToken(token));
}

export function getUserPermissions(userId: number) {
  return postgres() ? pgAuth.getUserPermissions(userId) : Promise.resolve(sqliteAuth.getUserPermissions(userId));
}

export function getUserProcessAssignments(userId: number) {
  return postgres()
    ? pgAuth.getUserProcessAssignments(userId)
    : Promise.resolve(sqliteAuth.getUserProcessAssignments(userId));
}

export function setUserPermissions(userId: number, permissions: Parameters<typeof sqliteAuth.setUserPermissions>[1]) {
  return postgres()
    ? pgAuth.setUserPermissions(userId, permissions)
    : Promise.resolve(sqliteAuth.setUserPermissions(userId, permissions));
}

export function setUserProcessAssignments(
  userId: number,
  stages: Parameters<typeof sqliteAuth.setUserProcessAssignments>[1],
) {
  return postgres()
    ? pgAuth.setUserProcessAssignments(userId, stages)
    : Promise.resolve(sqliteAuth.setUserProcessAssignments(userId, stages));
}

export function publicUser(user: Parameters<typeof sqliteAuth.publicUser>[0]) {
  return postgres() ? pgAuth.publicUser(user) : Promise.resolve(sqliteAuth.publicUser(user));
}

export function createUser(email: string, passwordHash: string, name: string | null) {
  return postgres()
    ? pgAuth.createUser(email, passwordHash, name)
    : Promise.resolve(sqliteAuth.createUser(email, passwordHash, name));
}

export function createUserByAdmin(
  ...args: Parameters<typeof sqliteAuth.createUserByAdmin>
) {
  return postgres() ? pgAuth.createUserByAdmin(...args) : Promise.resolve(sqliteAuth.createUserByAdmin(...args));
}

export function updateUserByAdmin(...args: Parameters<typeof sqliteAuth.updateUserByAdmin>) {
  return postgres() ? pgAuth.updateUserByAdmin(...args) : Promise.resolve(sqliteAuth.updateUserByAdmin(...args));
}

export function deleteUserById(id: number) {
  return postgres() ? pgAuth.deleteUserById(id) : Promise.resolve(sqliteAuth.deleteUserById(id));
}

export function countAdmins() {
  return postgres() ? pgAuth.countAdmins() : Promise.resolve(sqliteAuth.countAdmins());
}

export function approveUserByToken(token: string) {
  return postgres() ? pgAuth.approveUserByToken(token) : Promise.resolve(sqliteAuth.approveUserByToken(token));
}

export function approveUserById(id: number) {
  return postgres() ? pgAuth.approveUserById(id) : Promise.resolve(sqliteAuth.approveUserById(id));
}

export function rejectUserById(id: number) {
  return postgres() ? pgAuth.rejectUserById(id) : Promise.resolve(sqliteAuth.rejectUserById(id));
}

export function listPendingUsers() {
  return postgres() ? pgAuth.listPendingUsers() : Promise.resolve(sqliteAuth.listPendingUsers());
}

export function listAllUsers() {
  return postgres() ? pgAuth.listAllUsers() : Promise.resolve(sqliteAuth.listAllUsers());
}

export function listAssignableUsers() {
  return postgres() ? pgAuth.listAssignableUsers() : Promise.resolve(sqliteAuth.listAssignableUsers());
}

export function listProcessAssignmentsByStage() {
  return postgres()
    ? pgAuth.listProcessAssignmentsByStage()
    : Promise.resolve(sqliteAuth.listProcessAssignmentsByStage());
}

export function resetAdminAccount(email: string, password: string, name = 'Admin') {
  return postgres()
    ? pgAuth.resetAdminAccount(email, password, name)
    : Promise.resolve(sqliteAuth.resetAdminAccount(email, password, name));
}
