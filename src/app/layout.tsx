import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import { TopBar } from "@/components/TopBar";
import { getSessionUser } from "@/server/auth";
import "./globals.css";

const notoBengali = Noto_Sans_Bengali({
  variable: "--font-bn",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "সেবা সহায়ক AI",
  description: "বাংলাদেশ সরকারের সেবা সম্পর্কিত প্রশ্নের উত্তর দেয় এমন AI সহকারী",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the saved theme before first paint to avoid a light/dark flash.
const themeScript = `try{var s=JSON.parse(localStorage.getItem('seba.prefs')||'{}');if(s.theme==='light'||s.theme==='dark')document.documentElement.setAttribute('data-theme',s.theme);if(s.lang==='en')document.documentElement.lang='en'}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  return (
    <html lang="bn" className={notoBengali.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppProvider user={user}>
          <div className="app">
            <TopBar />
            <main>{children}</main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
