// ¿Roy (la cuenta de IG del negocio) sigue a esta persona? Si la sigue, es
// alguien de su círculo y el bot no debe activarse — la conversación se queda
// para que Roy conteste él. Solo Instagram expone este dato (Messenger no tiene
// forma de consultar amistad). Ante cualquier error (p.ej. code 230 "user
// consent required" en perfiles restringidos) se asume que NO lo sigue, para
// no dejar clientes en visto por una falla de la API.
export async function royFollowsInstagramUser(igsid: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${igsid}?fields=is_business_follow_user&access_token=${process.env.IG_PAGE_ACCESS_TOKEN}`
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.is_business_follow_user === true;
  } catch {
    return false;
  }
}
