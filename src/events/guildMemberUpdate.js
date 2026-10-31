// Someone's member info changed. Used to keep paid nicknames in place: if the
// renamed person changes their nickname back early, NestBot sets it again.
// Only works when the "Server Members" intent is on (see src/index.js).
const nickname = require('../services/nickname');

module.exports = async function onMemberUpdate(oldMember, newMember) {
  try {
    const active = nickname.getActive(newMember.guild.id, newMember.id);
    if (!active || newMember.nickname === active.name) return;
    await newMember
      .setNickname(active.name, 'Paid nickname is still running')
      .catch(() => {});
  } catch (e) {
    console.error('[Nickname] member update failed:', e.message);
  }
};
