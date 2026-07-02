export interface ProfileInfo {
  displayName: string | null;
  avatarUrl: string | null;
}

// Instagram no manda el nombre del usuario en el evento del mensaje, solo su
// IGSID — hay que pedirlo aparte. graph.instagram.com porque es el flujo
// "Instagram API with Instagram Login".
export async function fetchInstagramProfile(igsid: string): Promise<ProfileInfo> {
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${igsid}?fields=username,profile_pic&access_token=${process.env.IG_PAGE_ACCESS_TOKEN}`
    );
    if (!res.ok) return { displayName: null, avatarUrl: null };
    const data = await res.json();
    return { displayName: data.username ? `@${data.username}` : null, avatarUrl: data.profile_pic ?? null };
  } catch {
    return { displayName: null, avatarUrl: null };
  }
}

export async function fetchMessengerProfile(psid: string): Promise<ProfileInfo> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${psid}?fields=first_name,last_name,profile_pic&access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`
    );
    if (!res.ok) return { displayName: null, avatarUrl: null };
    const data = await res.json();
    const displayName = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
    return { displayName, avatarUrl: data.profile_pic ?? null };
  } catch {
    return { displayName: null, avatarUrl: null };
  }
}
