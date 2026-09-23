export function publicMetadataHtml(html: string, siteOrigin?: string): string {
  return siteOrigin ? html.replaceAll('https://play-100-collection.vercel.app', siteOrigin) : html;
}
