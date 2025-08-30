export function hasAnyRole(member, allowedRoleIds) {
  return member.roles.cache.some(r => allowedRoleIds.includes(r.id));
}