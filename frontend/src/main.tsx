import { createRoot } from "react-dom/client";

import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles.css";
import "./styles/signal-room.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
