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
  description:
    'Documentation for Pandora — your personal AI agent. Self-hosted, extensible, and fully under your control.',
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        width: '100%',
      }}
    >
      <span
        className="display-heading"
        style={{ fontFamily: 'var(--font-fraunces)', fontSize: '1.1rem' }}
      >
        Pandora<span style={{ color: 'hsl(34, 78%, 60%)' }}>.</span>
      </span>
      <span style={{ opacity: 0.4, fontSize: '0.75rem' }}>
        MIT {new Date().getFullYear()} ©{' '}
        <a href="https://buttersmooth.io" style={{ textDecoration: 'underline' }}>
          Buttersmooth
        </a>
      </span>
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
      <body className={`${dmSans.variable} ${fraunces.variable} antialiased`}>
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
