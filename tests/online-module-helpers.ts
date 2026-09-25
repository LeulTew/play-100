export const onlinePageRoots = [
  'src/cloud/AuthPanel.tsx',
  'src/cloud/AccountPage.tsx',
  'src/cloud/CommunityPage.tsx',
  'src/cloud/PublicProfilePage.tsx',
  'src/cloud/PublishPage.tsx',
  'src/cloud/CreatorPage.tsx',
  'src/cloud/FriendsPage.tsx',
  'src/cloud/FriendDetailPage.tsx',
  'src/cloud/InvitationPage.tsx',
  'src/cloud/FriendComparisonPage.tsx',
  'src/cloud/FriendSharingPage.tsx',
  'src/cloud/FriendShelfPage.tsx',
  'src/cloud/FriendSharedGames.tsx',
  'src/components/avatar/AvatarPicker.tsx',
] as const;

export function onlineModuleRequest(root: string): RegExp {
  const name = root.slice(root.lastIndexOf('/') + 1, -4);
  return new RegExp(`/(?:${root.replaceAll('.', '\\.')}|assets/${name}-[^/]+\\.js)(?:\\?|$)`);
}
