import './globals.css'
import './jarvis-enhancements.css'

export const metadata = {
  title: 'JARVIS AI Brain',
  description: 'Local-first AI command system',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;600;700;900&family=Exo+2:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="mk2">{children}</body>
    </html>
  )
}
