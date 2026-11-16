export const PROFILE_AVATARS = Array.from(
  { length: 6 },
  (_, index) => `/avatars/pixel-${index + 1}.svg`,
);

export const isProfileAvatar = (image: string) => PROFILE_AVATARS.includes(image);
