import type { Metadata } from "next"
import { DM_Sans, Fraunces } from "next/font/google"
import "./globals.css"

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
})

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["WONK", "SOFT", "opsz"],
})

export const metadata: Metadata = {
  title: "Pandora — Your AI Agent, Fully Yours",
  description:
    "A personal AI assistant that runs on your hardware, remembers your context, and works on your schedule. You choose the AI provider. You own the data.",
  openGraph: {
    title: "Pandora — Your AI Agent, Fully Yours",
    description:
      "A personal AI assistant that runs on your hardware, remembers your context, and works on your schedule. You choose the AI provider. You own the data.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>): React.JSX.Element {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
