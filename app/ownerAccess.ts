// Call only with an identity obtained from verified server authentication.
export function hasOwnerAccess(userId: string, environment: string) {
  if (environment !== 'production' && environment !== 'preview') return false;
  return userId === 'pie-primary'
    || (environment === 'production' && userId === 'user_3JFNRykFY9nfjkxHkVkUBvPA34P');
}
