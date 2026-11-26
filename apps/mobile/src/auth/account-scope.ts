export type AccountScope = Readonly<{ backendOrigin: string; userId: string }>;

export function accountScopeKey(scope: AccountScope): string {
  return JSON.stringify([scope.backendOrigin, scope.userId]);
}
