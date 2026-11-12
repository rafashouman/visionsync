const publicPages = ["/login", "/cadastro", "/recuperar-senha", "/redefinir-senha"] as const
export type AnalyticsPage = typeof publicPages[number]

export function analyticsPage(path: string | null): AnalyticsPage | null {
  return publicPages.find(page => page === path) ?? null
}

export function analyticsFrame(page: AnalyticsPage): string {
  return `<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
dataLayer.push({'gtm.start': Date.now(), event: 'gtm.js', page_path: ${JSON.stringify(page)}});
dataLayer.push({event: 'visionsync_page_view', page_path: ${JSON.stringify(page)}});
</script>
<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-MXB9LSL6"></script>
</body></html>`
}
