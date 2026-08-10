import { useHashRoute } from "./router.js";
import { Layout } from "./components/Layout.js";
import { HomePage } from "./pages/HomePage.js";
import { AboutPage } from "./pages/AboutPage.js";
import { PrivacyPage } from "./pages/PrivacyPage.js";
import { EditorPage } from "./pages/EditorPage.js";
import { TreeSessionProvider } from "./state/treeSession.js";

export function App() {
  const route = useHashRoute();

  return (
    <TreeSessionProvider>
      <Layout current={route} fullBleed={route === "editor"}>
        {route === "home" && <HomePage />}
        {route === "about" && <AboutPage />}
        {route === "privacy" && <PrivacyPage />}
        {route === "editor" && <EditorPage />}
      </Layout>
    </TreeSessionProvider>
  );
}
