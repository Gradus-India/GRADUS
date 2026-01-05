/*
  Frontend entrypoint (public site)
  - Loads global styles/vendor CSS and mounts the React app
  - Wraps <App/> with AuthProvider for authenticated user state
*/
import "./utils/suppressWarnings.js";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "animate.css";
// import "react-modal-video/css/modal-video.css"; // Moved to specific components
// import "lightgallery/css/lightgallery.css"; // Moved to GallerySection.jsx
// import "lightgallery/css/lg-zoom.css";
// import "lightgallery/css/lg-thumbnail.css";

// Fonts
import "@fontsource/plus-jakarta-sans";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/inter";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import "animate.css/animate.css";
// import "swiper/css"; // Moved to specific components
// import "swiper/css"; 
// import "swiper/css/navigation";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import "./globals.css";
import "./styles/events-card.css";

createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <App />
    <ToastContainer />
  </AuthProvider>
);
