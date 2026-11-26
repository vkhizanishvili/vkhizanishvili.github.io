// Полный адрес сайта без «/» в конце: из настроек (site.url) или из переменной
// SITE_URL, которую задаёт GitHub Actions при публикации. Нужен для превью ссылок и sitemap.
export default {
  baseUrl: (data) => String(data.site?.url || process.env.SITE_URL || "").replace(/\/+$/, ""),
};
