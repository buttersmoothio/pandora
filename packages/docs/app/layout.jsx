import { DM_Sans, Fraunces } from 'next/font/google'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import 'nextra-theme-docs/style.css'
import './globals.css'

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
})

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['WONK', 'SOFT', 'opsz'],
})

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
    logo={
      <span
        className="display-heading"
        style={{ fontFamily: 'var(--font-fraunces)', fontSize: '1.25rem' }}
      >
        Pandora<span style={{ color: 'hsl(34, 78%, 60%)' }}>.</span>
      </span>
    }
    projectLink="https://github.com/buttersmoothio/pandora"
  >
    <a href="https://pandorakit.com" style={{ fontSize: '0.875rem', opacity: 0.6 }}>
      Home
    </a>
  </Navbar>
)

const footer = (
  <Footer>
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      MIT {new Date().getFullYear()} ©{' '}
      <a
        href="https://buttersmooth.io"
        style={{ textDecoration: 'underline', opacity: 0.8, marginLeft: '4px' }}
      >
        Buttersmooth
      </a>
    </div>
  </Footer>
)

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head
        color={{
          hue: { dark: 34, light: 34 },
          saturation: { dark: 78, light: 78 },
          lightness: { dark: 55, light: 45 },
        }}
        backgroundColor={{
          dark: 'rgb(15,15,15)',
          light: 'rgb(250,250,247)',
        }}
      >
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <body className={`${dmSans.variable} ${fraunces.variable}`}>
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
