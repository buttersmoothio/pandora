import { Hero } from "@/components/hero"
import { Nav } from "@/components/nav"

export default function Home(): React.JSX.Element {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <Nav />
      <Hero />
    </main>
  )
}
