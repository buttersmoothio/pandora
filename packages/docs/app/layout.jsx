import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: {
    default: 'Pandora Documentation',
    template: '%s | Pandora Docs',
  },
  description: 'Documentation for Pandora - Your extensible AI assistant',
  icons: {
    icon: '/favicon.ico',
  },
}

const navbar = (
  <Navbar
    logo={<span style={{ fontWeight: 700, fontSize: '1.2rem' }}>Pandora</span>}
    projectLink="https://github.com/buttersmoothio/pandora"
  />
)

const footer = (
  <Footer>
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      MIT {new Date().getFullYear()} © Pandora
    </div>
  </Footer>
)

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/buttersmoothio/pandora/tree/master/packages/docs"
          footer={footer}
          sidebar={{ defaultMenuCollapseLevel: 1 }}
          toc={{ backToTop: true }}
          editLink="Edit this page on GitHub"
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
