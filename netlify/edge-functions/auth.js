// Пароль на весь сайт (HTTP Basic Auth). Проверка идёт на сервере Netlify.
// Пароль хранится в переменной окружения SITE_PASSWORD (не в коде).
export default async (request, context) => {
  const password = Netlify.env.get("SITE_PASSWORD");
  const user = Netlify.env.get("SITE_USER") || "admin";

  // Если пароль не задан, сайт закрыт полностью (безопасный отказ).
  if (!password || password.length < 8) {
    return new Response("Сайт закрыт: не задан SITE_PASSWORD (минимум 8 символов).", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (i >= 0 && safeEqual(decoded.slice(0, i), user) & safeEqual(decoded.slice(i + 1), password)) {
        return context.next();
      }
    } catch (_) { /* неверный заголовок -> запросим пароль заново */ }
  }
  return new Response("Требуется пароль", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Private", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};

// Сравнение за постоянное время, возвращает 1 или 0
function safeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0 ? 1 : 0;
}

export const config = { path: "/*" };
