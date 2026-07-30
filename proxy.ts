import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /datos-alumno es el formulario que los alumnos llenan sin cuenta.
const PUBLIC_PATHS = ["/login", "/datos-alumno"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/inbox", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // api/alumnos queda fuera porque su POST es público (el formulario de los
    // alumnos); su GET verifica la sesión dentro de la propia ruta.
    "/((?!api/webhooks|api/cron|api/tickets|api/campanas|api/finanzas|api/alumnos|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.png|icon-192.png|icon-512.png|apple-icon.png|logo-vita.png).*)",
  ],
};
