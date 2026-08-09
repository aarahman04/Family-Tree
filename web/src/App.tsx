import { useHashRoute } from "./router.js";
import { Layout } from "./components/Layout.js";
import { HomePage } from "./pages/HomePage.js";
import { AboutPage } from "./pages/AboutPage.js";
import { PrivacyPage } from "./pages/PrivacyPage.js";

export function App() {
  const route = useHashRoute();

  return (
    <Layout current={route}>
      {route === "home" && <HomePage />}
      {route === "about" && <AboutPage />}
      {route === "privacy" && <PrivacyPage />}
    </Layout>
  );
}
